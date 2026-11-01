#!/usr/bin/env python3
"""Guard that the address notice panel uses the pure layout policy."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
VIEW = (ROOT / "app/src/main/java/com/abrar/daymark/BrowserAddressNoticeView.java").read_text(encoding="utf-8")
POLICY = (ROOT / "app/src/main/java/com/abrar/daymark/BrowserAddressNoticePanelPolicy.java").read_text(encoding="utf-8")

assert "BrowserAddressNoticePanelPolicy.maxHeightBelowAnchorPx" in VIEW
assert "BrowserAddressNoticePanelPolicy.fitContentHeightPx" in VIEW
assert "static int maxHeightBelowAnchorPx" in POLICY
print("PASS address notice panel policy integration")
