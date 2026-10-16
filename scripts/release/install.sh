#!/usr/bin/env bash
# Installs or upgrades the Stingr Scout hub for the current user. Run it from the unpacked release folder:
#   ./install.sh               install or upgrade
#   ./install.sh --uninstall   remove the program (your scouting data is kept)
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
SHARE="${XDG_DATA_HOME:-$HOME/.local/share}"
BASE="$SHARE/stingr-scout"
APP="$BASE/app"
DATA="$BASE/data"
BIN_DIR="$HOME/.local/bin"
DESKTOP="$SHARE/applications/stingr-scout.desktop"

say() { printf '%s\n' "$*"; }

if [ "${1:-}" = "--uninstall" ]; then
  rm -rf "$APP" "$BIN_DIR/stingr-hub" "$DESKTOP"
  say "Stingr Scout hub removed. Your scouting data is still in $DATA"
  exit 0
fi

if [ "$(uname -s)" != "Linux" ] || [ "$(uname -m)" != "x86_64" ]; then
  say "This release is for 64-bit Linux on Intel/AMD (x86_64). This computer is $(uname -s) $(uname -m)."
  exit 1
fi

# adb lets the hub talk to tablets over USB.
if [ -z "${STINGR_SKIP_ADB:-}" ] && ! command -v adb >/dev/null 2>&1; then
  if command -v apt-get >/dev/null 2>&1; then
    say "Installing adb (used to talk to the tablets over USB). You may be asked for your password."
    if ! { sudo apt-get update && sudo apt-get install -y adb; }; then
      say "Could not install adb automatically. Ask someone with admin rights to run:"
      say "    sudo apt-get install adb"
      say "then run ./install.sh again."
      exit 1
    fi
  else
    say "Please install adb with your system's package manager, then run ./install.sh again."
    exit 1
  fi
fi

# A running hub would keep serving the old version (and holds the port the new one needs).
if command -v pgrep >/dev/null 2>&1 && pgrep -f "$APP/hub.mjs" >/dev/null 2>&1; then
  say "The Stingr Scout hub is running. Close the Stingr Scout Hub window, then run ./install.sh again."
  exit 1
fi

mkdir -p "$BASE" "$BIN_DIR" "$(dirname "$DESKTOP")"

# Copy the new version beside the old one, then swap, so a failed copy never leaves a half-installed hub.
# Works even when this script is the installed copy: it is copied before anything is replaced.
rm -rf "$APP.new" "$APP.old"
cp -R "$HERE" "$APP.new"
if [ -d "$APP" ]; then mv "$APP" "$APP.old"; fi
mv "$APP.new" "$APP"
rm -rf "$APP.old"
chmod +x "$APP/stingr-hub" "$APP/node" "$APP/install.sh"
printf '%s\n' "$DATA" > "$APP/data-dir" # the hub uses this folder however it is started

ln -sf "$APP/stingr-hub" "$BIN_DIR/stingr-hub"
cat > "$DESKTOP" <<DESKTOP_ENTRY
[Desktop Entry]
Type=Application
Name=Stingr Scout Hub
Comment=Collect scouting data from the tablets
Exec=$BIN_DIR/stingr-hub --from-menu
Icon=$APP/icon.png
Terminal=true
Categories=Utility;
DESKTOP_ENTRY

say "Installed Stingr Scout hub $(cat "$APP/VERSION")."
say "Start it from your applications menu (Stingr Scout Hub) or by running: stingr-hub"
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) say "(The stingr-hub command works in new terminal windows; until then use $BIN_DIR/stingr-hub)" ;;
esac
say "Your scouting data is kept in $DATA"
