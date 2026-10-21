#!/usr/bin/env zsh

# Offline Fitness Line Counter
# Usage: ./count-lines.sh [--no-android] [--no-python] [--help]

set -e

# Default options
EXCLUDE_ANDROID=false
EXCLUDE_PYTHON=false
SHOW_HELP=false

# Parse command line arguments
for arg in "$@"; do
  case $arg in
    --no-android)
      EXCLUDE_ANDROID=true
      shift
      ;;
    --no-python)
      EXCLUDE_PYTHON=true
      shift
      ;;
    --help|-h)
      SHOW_HELP=true
      shift
      ;;
    *)
      echo "Unknown option: $arg"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

# Show help
if [[ "$SHOW_HELP" == true ]]; then
  echo "Offline Fitness Line Counter"
  echo ""
  echo "Usage: $0 [OPTIONS]"
  echo ""
echo "Options:"
echo "  --no-android    Exclude android folder from count"
echo "  --no-python     Exclude Python files from count"
echo "  --help, -h      Show this help message"
echo ""
echo "Examples:"
echo "  $0                    # Count all source files"
echo "  $0 --no-android       # Count excluding android folder"
echo "  $0 --no-python        # Count excluding Python files"
echo "  $0 --no-android --no-python # Count excluding both"
  exit 0
fi

# Build find command
FIND_CMD="find . -type f \\( -name \"*.ts\" -o -name \"*.tsx\" -o -name \"*.js\" -o  -name \"*.md\" -o -name \"*.cjs\" -o -name \"*.mjs\"  -o -name \"*.xml\" -o -name \"*.java\" -o -name \"*.py\" -o -name \"*.sh\" -o -name \"*.zsh\" \\) -not -path \"./node_modules/*\""

# Add exclusions if requested
EXCLUSIONS=()
if [[ "$EXCLUDE_ANDROID" == true ]]; then
  FIND_CMD="$FIND_CMD -not -path \"./android/*\""
  EXCLUSIONS+=("android folder")
fi

if [[ "$EXCLUDE_PYTHON" == true ]]; then
  FIND_CMD="$FIND_CMD -not -name \"*.py\""
  EXCLUSIONS+=("Python files")
fi

# Set default exclusions if no specific exclusions
if [[ ${#EXCLUSIONS[@]} -eq 0 ]]; then
  FIND_CMD="$FIND_CMD -not -path \"./android/app/build/*\" -not -path \"./android/build/*\" -not -path \"./android/app/build/generated/*\" -not -path \"./android/app/build/intermediates/*\""
  echo "Counting lines of code (excluding build artifacts)..."
else
  echo "Counting lines of code (excluding: ${EXCLUSIONS[*]})..."
fi

# Execute the count
TOTAL_LINES=$(eval "$FIND_CMD -print0 | xargs -0 wc -l | tail -n1 | awk '{print \$1}'")

# Display result
echo "Total lines: $TOTAL_LINES"

# Show breakdown by file type
echo ""
echo "Breakdown by file type:"
for ext in ts tsx js  md cjs mjs xml java py sh zsh; do
  # Skip Python files if excluded
  if [[ "$EXCLUDE_PYTHON" == true && "$ext" == "py" ]]; then
    continue
  fi
  
  COUNT_CMD="find . -name \"*.$ext\" -not -path \"./node_modules/*\""
  
  # Apply exclusions
  if [[ "$EXCLUDE_ANDROID" == true ]]; then
    COUNT_CMD="$COUNT_CMD -not -path \"./android/*\""
  else
    COUNT_CMD="$COUNT_CMD -not -path \"./android/app/build/*\" -not -path \"./android/build/*\" -not -path \"./android/app/build/generated/*\" -not -path \"./android/app/build/intermediates/*\""
  fi
  
  LINES=$(eval "$COUNT_CMD -print0 | xargs -0 wc -l 2>/dev/null | tail -n1 | awk '{print \$1}'" || echo "0")
  if [[ "$LINES" != "0" ]]; then
    printf "  %-6s: %8s lines\n" ".$ext" "$LINES"
  fi
done
