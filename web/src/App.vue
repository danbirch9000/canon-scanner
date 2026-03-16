<script setup>
import { computed, onMounted, reactive, ref } from "vue";

const state = reactive({
  mode: "single",
  colorMode: "color",
  resolution: 300,
  format: "pdf",
  compression: "medium",
  filename: "scan",
  device: ""
});

const scanners = ref([]);
const files = ref([]);
const loading = ref(false);
const status = ref("Ready.");
const error = ref("");
const session = ref(null);

const compressionDisabled = computed(() => state.format !== "pdf");

async function request(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options
  });

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json() : null;

  if (!response.ok) {
    throw new Error(payload?.error || `Request failed with status ${response.status}`);
  }

  return payload;
}

async function loadScanners() {
  try {
    const payload = await request("/api/scanners");
    scanners.value = payload.scanners;
    if (!state.device && payload.scanners.length > 0) {
      state.device = payload.scanners[0].id;
    }
  } catch (err) {
    error.value = err.message;
  }
}

async function loadFiles() {
  try {
    const payload = await request("/api/files");
    files.value = payload.files;
  } catch (err) {
    error.value = err.message;
  }
}

function payloadFromState() {
  return {
    filename: state.filename,
    format: state.format,
    mode: state.colorMode,
    resolution: Number(state.resolution),
    compression: state.compression,
    device: state.device
  };
}

async function runSingleScan() {
  loading.value = true;
  error.value = "";
  status.value = "Scanning page...";

  try {
    const payload = await request("/api/scan", {
      method: "POST",
      body: JSON.stringify(payloadFromState())
    });
    status.value = `Saved ${payload.files.map((file) => file.name).join(", ")}.`;
    await loadFiles();
  } catch (err) {
    error.value = err.message;
    status.value = "Scan failed.";
  } finally {
    loading.value = false;
  }
}

async function startMultiPageScan() {
  loading.value = true;
  error.value = "";
  status.value = "Starting a new multi-page session...";

  try {
    session.value = await request("/api/scan/multipage/start", {
      method: "POST",
      body: JSON.stringify(payloadFromState())
    });
    status.value = "Session ready. Load a page and click Add page.";
  } catch (err) {
    error.value = err.message;
    status.value = "Could not start the session.";
  } finally {
    loading.value = false;
  }
}

async function addPage() {
  if (!session.value) {
    return;
  }

  loading.value = true;
  error.value = "";
  status.value = `Scanning page ${session.value.pageCount + 1}...`;

  try {
    const payload = await request(`/api/scan/multipage/${session.value.sessionId}/page`, {
      method: "POST"
    });
    session.value = { ...session.value, pageCount: payload.pageCount };
    status.value = `Captured ${payload.pageCount} page${payload.pageCount === 1 ? "" : "s"}.`;
  } catch (err) {
    error.value = err.message;
    status.value = "Could not add that page.";
  } finally {
    loading.value = false;
  }
}

async function finishSession() {
  if (!session.value) {
    return;
  }

  loading.value = true;
  error.value = "";
  status.value = "Building output files...";

  try {
    const payload = await request(`/api/scan/multipage/${session.value.sessionId}/finish`, {
      method: "POST"
    });
    status.value = `Saved ${payload.files.map((file) => file.name).join(", ")}.`;
    session.value = null;
    await loadFiles();
  } catch (err) {
    error.value = err.message;
    status.value = "Could not finish the session.";
  } finally {
    loading.value = false;
  }
}

async function cancelSession() {
  if (!session.value) {
    return;
  }

  loading.value = true;
  error.value = "";

  try {
    await request(`/api/scan/multipage/${session.value.sessionId}`, {
      method: "DELETE"
    });
    session.value = null;
    status.value = "Session cancelled.";
  } catch (err) {
    error.value = err.message;
    status.value = "Could not cancel the session.";
  } finally {
    loading.value = false;
  }
}

async function submit() {
  if (state.mode === "single") {
    await runSingleScan();
    return;
  }

  if (!session.value) {
    await startMultiPageScan();
  }
}

onMounted(async () => {
  await Promise.all([loadScanners(), loadFiles()]);
});
</script>

<template>
  <main class="app-shell">
    <section class="hero">
      <p class="eyebrow">USB Scanner Workspace</p>
      <h1>Scan paper without rebuilding your laptop ritual every time.</h1>
      <p class="lede">
        This UI wraps the native macOS scanner tools, so the browser stays simple while USB access
        stays reliable on the host.
      </p>
    </section>

    <section class="panel layout">
      <form class="controls" @submit.prevent="submit">
        <div class="field-grid">
          <label>
            Mode
            <select v-model="state.mode">
              <option value="single">Single page</option>
              <option value="multi">Multi-page session</option>
            </select>
          </label>

          <label>
            Scanner
            <select v-model="state.device">
              <option v-for="scanner in scanners" :key="scanner.id" :value="scanner.id">
                {{ scanner.label }}
              </option>
            </select>
          </label>

          <label>
            Colour
            <select v-model="state.colorMode">
              <option value="color">Colour</option>
              <option value="gray">Black &amp; white</option>
            </select>
          </label>

          <label>
            Resolution
            <input v-model="state.resolution" type="number" min="75" step="75" />
          </label>

          <label>
            Output
            <select v-model="state.format">
              <option value="pdf">PDF</option>
              <option value="png">PNG</option>
            </select>
          </label>

          <label>
            Compression
            <select v-model="state.compression" :disabled="compressionDisabled">
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
              <option value="none">None</option>
            </select>
          </label>

          <label class="wide">
            Filename
            <input v-model="state.filename" type="text" />
          </label>
        </div>

        <div class="actions" v-if="state.mode === 'single'">
          <button :disabled="loading" type="submit">Scan now</button>
        </div>

        <div class="actions" v-else-if="!session">
          <button :disabled="loading" type="submit">Start session</button>
        </div>

        <div class="session" v-else>
          <p>
            Session <strong>{{ session.sessionId.slice(0, 8) }}</strong> is live with
            <strong>{{ session.pageCount }}</strong> page{{ session.pageCount === 1 ? "" : "s" }}.
          </p>
          <div class="actions">
            <button :disabled="loading" type="button" @click="addPage">Add page</button>
            <button :disabled="loading || session.pageCount === 0" type="button" @click="finishSession">
              Finish
            </button>
            <button :disabled="loading" class="ghost" type="button" @click="cancelSession">
              Cancel
            </button>
          </div>
        </div>

        <p class="status">{{ status }}</p>
        <p v-if="error" class="error">{{ error }}</p>
      </form>

      <aside class="files">
        <div class="files-header">
          <h2>Recent scans</h2>
          <button class="ghost" type="button" @click="loadFiles">Refresh</button>
        </div>
        <ul v-if="files.length > 0">
          <li v-for="file in files" :key="file.name">
            <a :href="file.url" target="_blank" rel="noreferrer">{{ file.name }}</a>
            <span>{{ new Date(file.modifiedAt).toLocaleString() }}</span>
          </li>
        </ul>
        <p v-else>No scans saved yet.</p>
      </aside>
    </section>
  </main>
</template>

