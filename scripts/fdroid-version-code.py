#!/usr/bin/env python3
"""Print the Android versionCode of the single-ABI build for the given ABI.

Mirrors plugins/withAndroidRelease.js: app.json versionCode * 10 + ABI digit.
Usage: scripts/fdroid-version-code.py arm64-v8a
"""
import json
import sys

ABI_DIGITS = {"armeabi-v7a": 1, "arm64-v8a": 2, "x86": 3, "x86_64": 4}

abi = sys.argv[1] if len(sys.argv) == 2 else ""
if abi not in ABI_DIGITS:
    sys.exit(f"usage: {sys.argv[0]} <{'|'.join(ABI_DIGITS)}>")

with open("app.json", encoding="utf-8") as handle:
    base = json.load(handle)["expo"]["android"]["versionCode"]
print(base * 10 + ABI_DIGITS[abi])
