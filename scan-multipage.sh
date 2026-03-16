#!/usr/bin/env bash

# multipage_scanner.sh
# A robust single- and multi-page scanning script with optional PDF/PNG output and compression

set -euo pipefail
IFS=$'\n\t'

# Default scanner device (override if needed)
SCANNER="pixma:04A91747_85A264"
# To autodetect: uncomment the following line
# SCANNER=$(scanimage -L | awk -F"device `|':" '/device/ {print $2; exit}')

# Prompt for scan mode
echo "Choose scan mode:"
echo "1) Single Page Scan"
echo "2) Multi-Page Scan"
read -r -p "Enter choice (1/2): " SCAN_MODE

# Prompt for color mode
echo "Choose color mode:"
echo "1) Color"
echo "2) Black & White"
read -r -p "Enter choice (1/2): " COLOR_MODE
case "$COLOR_MODE" in
    1) MODE="Color" ;;  
    2) MODE="Gray"  ;; 
    *) echo "Invalid choice; defaulting to Color."; MODE="Color" ;;
esac

# Prompt for resolution
read -r -p "Enter scan resolution DPI (e.g., 150, 300, 600) [300]: " RESOLUTION
RESOLUTION=${RESOLUTION:-300}

# Prompt for output format
echo "Choose output format:"
echo "1) PDF"
echo "2) PNG"
read -r -p "Enter choice (1/2): " FILE_FMT
case "$FILE_FMT" in
    1) FORMAT="pdf" ;;  
    2) FORMAT="png" ;; 
    *) echo "Invalid choice; defaulting to PDF."; FORMAT="pdf" ;;
esac

# If PDF, prompt for compression level
if [[ "$FORMAT" == "pdf" ]]; then
    echo "Choose PDF compression level:"
    echo "1) High  (small file, lower quality)"
    echo "2) Medium (balanced)"
    echo "3) Low   (high quality, larger)"
    echo "4) None  (no compression)"
    read -r -p "Enter choice (1-4) [2]: " COMP
    COMP=${COMP:-2}
    case "$COMP" in
        1) PDFSETTINGS="/screen"   ;;  
        2) PDFSETTINGS="/ebook"    ;;  
        3) PDFSETTINGS="/printer"  ;;  
        4) PDFSETTINGS="/prepress" ;;  
        *) echo "Invalid; using medium."; PDFSETTINGS="/ebook" ;;
    esac
fi

# Single-page scanning
if [[ "$SCAN_MODE" == "1" ]]; then
    while true; do
        read -r -p "Enter filename (without extension) or 'exit' to quit: " FILENAME
        if [[ "$FILENAME" == "exit" ]]; then
            echo "Exiting."; break
        fi
        TEMP="${FILENAME}.pnm"
        OUT="${FILENAME}.${FORMAT}"

        echo "Scanning $FILENAME..."
        scanimage --device "$SCANNER" --mode "$MODE" --resolution "$RESOLUTION" --format=pnm > "$TEMP"

        if [[ "$FORMAT" == "png" ]]; then
            magick convert -resize 1200x1200 -quality 85 "$TEMP" "$OUT"
        else
            # create temp PDF
            magick convert -resize 1200x1200 -quality 85 "$TEMP" temp.pdf
            if [[ -n "${PDFSETTINGS:-}" ]]; then
                echo "Compressing PDF..."
                gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 \
                   -dPDFSETTINGS=$PDFSETTINGS -dNOPAUSE -dQUIET -dBATCH \
                   -sOutputFile="$OUT" temp.pdf
                rm -f temp.pdf
            else
                mv temp.pdf "$OUT"
            fi
        fi
        rm -f "$TEMP"
        echo "Saved as $OUT"
    done
    exit 0
fi

# Multi-page scanning
read -r -p "Enter base name for output file (without extension) [scan]: " FILENAME
FILENAME=${FILENAME:-scan}

# Prepare temp directory and cleanup trap
tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT
page=1

echo "Starting multi-page scan."
while true; do
    # Prompt before each scan so you can load a new page
    read -r -p "Load page $page and press ENTER to scan, or type 'done' to finish: " ans
    if [[ "$ans" == "done" ]]; then
        echo "Finishing scan sequence."; break
    fi

    PNM="$tmpdir/page-$page.pnm"
    echo "Scanning page $page..."
    scanimage --device "$SCANNER" --mode "$MODE" --resolution "$RESOLUTION" --format=pnm > "$PNM"
    ((page++))
done

# Generate outputs
if [[ "$FORMAT" == "png" ]]; then
    echo "Converting pages to PNG..."
    for f in "$tmpdir"/*.pnm; do
        out="${f%.pnm}.png"
        magick convert -resize 1200x1200 -quality 85 "$f" "$out"
    done
    echo "All PNGs saved in current directory."
else
    echo "Generating multi-page PDF..."
    magick convert -resize 1200x1200 -quality 85 "$tmpdir"/*.pnm temp.pdf
    if [[ -n "${PDFSETTINGS:-}" ]]; then
        echo "Compressing PDF..."
        gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 \
           -dPDFSETTINGS=$PDFSETTINGS -dNOPAUSE -dQUIET -dBATCH \
           -sOutputFile="${FILENAME}.pdf" temp.pdf
        rm -f temp.pdf
    else
        mv temp.pdf "${FILENAME}.pdf"
    fi
    echo "Multi-page PDF saved as ${FILENAME}.pdf"
fi

echo "Done!"