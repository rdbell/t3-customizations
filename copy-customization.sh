#!/bin/zsh
set -euo pipefail

customization_dir=${0:A:h}
sound_file="$customization_dir/codec.wav"
source_files=(
  "$customization_dir/features/notifications.js"
  "$customization_dir/features/sidebar-sorting.js"
  "$customization_dir/features/message-reuse.js"
  "$customization_dir/features/settings.js"
  "$customization_dir/features/sidebar-project-groups.js"
  "$customization_dir/customizations.js"
)

if [[ ! -f "$sound_file" ]]; then
  print -u2 "Missing notification sound: $sound_file"
  exit 1
fi

for source_file in $source_files; do
  if [[ ! -f "$source_file" ]]; then
    print -u2 "Missing customization source: $source_file"
    exit 1
  fi
done

{
  print -n 'window.__t3CodecNotificationSoundBase64="'
  base64 < "$sound_file" | tr -d '\n'
  print '";'
  command cat $source_files
} | pbcopy

print "Copied T3 customizations with codec.wav embedded."
