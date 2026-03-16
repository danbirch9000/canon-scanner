#!/bin/bash

# Set default scanner device
SCANNER="pixma:04A91747_85A264"

# Ask for color mode
echo "Choose scan mode:"
echo "1) Color"
echo "2) Black & White"
read -p "Enter choice (1/2): " COLOR_MODE

if [[ "$COLOR_MODE" == "1" ]]; then
    MODE="Color"
elif [[ "$COLOR_MODE" == "2" ]]; then
    MODE="Gray"
else
    echo "Invalid choice. Defaulting to Color."
    MODE="Color"
fi

# Ask for resolution
read -p "Enter scan resolution (e.g., 150, 300, 600): " RESOLUTION
RESOLUTION=${RESOLUTION:-300}  # Default to 300 DPI if empty

# Ask for file format
echo "Choose file format:"
echo "1) Image (PNM)"
echo "2) PDF"
read -p "Enter choice (1/2): " FILE_FORMAT

# Ask for output file name
read -p "Enter the file name (without extension): " FILENAME
FILENAME=${FILENAME:-scan}  # Default to "scan" if no name is given

# Perform the scan
echo "Scanning..."
if [[ "$FILE_FORMAT" == "1" ]]; then
    OUTPUT_FILE="${FILENAME}.pnm"
    scanimage --device $SCANNER --mode $MODE --resolution $RESOLUTION --format=pnm > "$OUTPUT_FILE"
    echo "Scan saved as $OUTPUT_FILE"
elif [[ "$FILE_FORMAT" == "2" ]]; then
    OUTPUT_FILE="${FILENAME}.pdf"
    TEMP_FILE="${FILENAME}.pnm"
    scanimage --device $SCANNER --mode $MODE --resolution $RESOLUTION --format=pnm > "$TEMP_FILE"
    magick convert "$TEMP_FILE" "$OUTPUT_FILE"
    rm "$TEMP_FILE"  # Clean up intermediate file
    echo "Scan saved as $OUTPUT_FILE"
else
    echo "Invalid choice. Exiting."
    exit 1
fi

echo "Done!"
