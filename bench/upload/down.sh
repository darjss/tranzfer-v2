#!/usr/bin/env bash
out=./down.raw; : > $out
d() { curl -s -o /dev/null -w '%{speed_download}\n' 'https://speed.cloudflare.com/__down?bytes=25000000'; }
for i in 1 2 3; do echo "down1 $(d)" >> $out; done
for n in 4 8 16; do for r in 1 2 3; do
  s=$(date +%s.%N)
  sum=$(for i in $(seq $n); do d & done | awk '{s+=$1} END{printf "%d", s}'; wait)
  e=$(date +%s.%N); echo "down$n $sum $(echo "$e - $s" | bc)" >> $out
done; done
