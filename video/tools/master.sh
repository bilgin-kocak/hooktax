#!/bin/sh
# Brings the rendered film to streaming loudness (-14 LUFS integrated, true peak under -1 dBTP):
# out/hooktax-raw.mp4 -> out/hooktax.mp4 (video stream copied untouched).
set -e
I=$(ffmpeg -hide_banner -i out/hooktax-raw.mp4 -map 0:a -af ebur128 -f null - 2>&1 | grep -E "^\s+I:" | tail -1 | awk '{print $2}')
GAIN=$(python3 -c "print(round(-14.0 - ($I), 2))")
echo "integrated loudness $I LUFS -> gain $GAIN dB"
ffmpeg -v error -y -i out/hooktax-raw.mp4 -map 0:v -map 0:a -c:v copy -af "volume=${GAIN}dB,alimiter=limit=0.89:attack=2:release=80:level=0" \
  -c:a aac -b:a 192k -ar 48000 -movflags +faststart out/hooktax.mp4
