#!/usr/bin/env bash
# Prepares a native speaker's phone recording for the app:
# trims leading and trailing silence, mono, loudness normalised to about -16 LUFS, MP3 at 64 kbps.
#
#   scripts/normalize-audio.sh kn remind_morning ~/Downloads/remind_morning_take2.m4a
#
# Phrase ids: remind_morning remind_afternoon remind_evening remind_night nudge taken_thanks press_green family_told
set -euo pipefail

lang="${1:?language code, e.g. kn}"
phrase="${2:?phrase id, e.g. remind_morning}"
input="${3:?recording file}"
out="web/public/audio/${lang}/${phrase}.mp3"

mkdir -p "$(dirname "$out")"
ffmpeg -hide_banner -loglevel error -y -i "$input" \
  -af "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.15,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.25,areverse,loudnorm=I=-16:TP=-1.5:LRA=11" \
  -ac 1 -ar 24000 -codec:a libmp3lame -b:a 64k "$out"
echo "Wrote $out"
