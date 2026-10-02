# /// script
# requires-python = ">=3.11"
# dependencies = ["mfusepy==3.1.1", "cryptography==50.0.1"]
# ///
"""Read-only FUSE filesystem exposing one deterministic synthetic file.

Content is the AES-256-CTR keystream of zeros with key sha256(seed) and
counter block = byte offset // 16, so any read range is computed on demand:
nothing is cached and every offset is seekable. `--flip OFFSET` XORs one byte
with 0xFF, giving a second file identical in name, size and mtime but different
in content, for impostor-pick tests.
"""

import argparse
import errno
import os
import signal
import stat
import subprocess
import sys
from hashlib import sha256

import mfusepy
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

BLOCK = 16


class SynthFile(mfusepy.Operations):
    use_ns = True

    def __init__(self, name: str, size: int, seed: str, mtime: int, flip: int | None):
        self.name = "/" + name
        self.size = size
        self.mtime = mtime
        self.flip = flip
        self.key = sha256(seed.encode()).digest()

    def _keystream(self, offset: int, length: int) -> bytes:
        # CTR mode increments the whole 128-bit counter block big-endian, so
        # starting at counter `offset // 16` gives the stream at that offset.
        head = offset % BLOCK
        counter = offset // BLOCK
        nonce = counter.to_bytes(BLOCK, "big")
        encryptor = Cipher(algorithms.AES(self.key), modes.CTR(nonce)).encryptor()
        stream = encryptor.update(b"\0" * (head + length)) + encryptor.finalize()
        return stream[head:]

    def getattr(self, path, fh=None):
        if path == "/":
            return {"st_mode": stat.S_IFDIR | 0o555, "st_nlink": 2, "st_mtime": self.mtime}
        if path == self.name:
            return {
                "st_mode": stat.S_IFREG | 0o444,
                "st_nlink": 1,
                "st_size": self.size,
                "st_mtime": self.mtime,
                "st_atime": self.mtime,
                "st_ctime": self.mtime,
            }
        raise mfusepy.FuseOSError(errno.ENOENT)

    def readdir(self, path, fh):
        return [".", "..", self.name[1:]]

    def open(self, path, flags):
        if path != self.name or flags & 0o3 != 0:
            raise mfusepy.FuseOSError(errno.EACCES)
        return 0

    def read(self, path, size, offset, fh):
        if path != self.name:
            raise mfusepy.FuseOSError(errno.ENOENT)
        end = min(offset + size, self.size)
        if end <= offset:
            return b""
        data = bytearray(self._keystream(offset, end - offset))
        if self.flip is not None and offset <= self.flip < end:
            data[self.flip - offset] ^= 0xFF
        return bytes(data)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("mount")
    parser.add_argument("--name", required=True)
    parser.add_argument("--size", type=int, required=True)
    parser.add_argument("--seed", required=True)
    parser.add_argument("--mtime-ms", type=int, required=True)
    parser.add_argument("--flip", type=int, default=None)
    args = parser.parse_args()

    os.makedirs(args.mount, exist_ok=True)
    # use_ns attrs take nanoseconds.
    fs = SynthFile(args.name, args.size, args.seed, args.mtime_ms * 1_000_000, args.flip)

    def shutdown(signum, frame):
        subprocess.run(["fusermount3", "-u", args.mount], check=False)
        sys.exit(0)

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)

    mfusepy.FUSE(fs, args.mount, foreground=True, nothreads=True)


if __name__ == "__main__":
    main()
