#!/usr/bin/env bash
# Link baseline. Writes link.json lines.
head -c 100000000 /dev/urandom > ./rand100.bin
up() { curl -s -o /dev/null -w '%{speed_upload}\n' -X POST --data-binary @./rand100.bin https://speed.cloudflare.com/__up; }
out=./link.raw; : > $out
for i in 1 2 3; do echo "single $(up)" >> $out; done
for n in 4 8 16; do
  for r in 1 2 3; do
    s=$(date +%s.%N)
    sum=$(for i in $(seq $n); do up & done | awk '{s+=$1} END{printf "%d", s}'; wait)
    e=$(date +%s.%N)
    echo "par$n $sum $(echo "$e - $s" | bc)" >> $out
  done
done
for i in 1 2 3; do echo "down $(curl -s -o /dev/null -w '%{speed_download}' 'https://speed.cloudflare.com/__down?bytes=100000000')" >> $out; done
for n in 4 8; do
  sum=$(for i in $(seq $n); do curl -s -o /dev/null -w '%{speed_download}\n' 'https://speed.cloudflare.com/__down?bytes=100000000' & done | awk '{s+=$1} END{printf "%d", s}'; wait)
  echo "downpar$n $sum" >> $out
done
