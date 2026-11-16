#!/usr/bin/env python3
# Emergency restore + patch helper for MainActivity.java, extracted verbatim from
# the inline python block of .github/workflows/restore-mainactivity-emergency.yml
# so the workflow run block stays actionlint-clean. Logic is unchanged.
#
# Restores MainActivity from a pinned commit and completes the offline WebView
# fail-closed paths plus the saved-site rail chip wiring. Idempotent: every patch
# is applied only when its target text is present and still needed.
from pathlib import Path
path = Path('android-app/app/src/main/java/com/abrar/daymark/MainActivity.java')
text = path.read_text(encoding='utf-8')
old_sig = '    private boolean ensureBrowserWebView(boolean allowOfflineLocalNavigation) {'
new_sig = '''    private boolean ensureBrowserWebView() {
        return ensureBrowserWebView(false);
    }

    private boolean ensureBrowserWebView(boolean allowOfflineLocalNavigation) {'''
if 'return ensureBrowserWebView(false);' not in text:
    text = text.replace(old_sig, new_sig, 1)
old = '''        if (BrowserUriRoutingPolicy.isOfflinePermittedWebViewScheme(scheme) || browserNetworkPolicy.allowsRemoteLoads()) {
            if (browserNetworkPolicy.allowsRemoteLoads()) {
                if (!ensureBrowserWebView()) {
                    showBrowserOfflineStatus();
                    return;
                }
                try {
                    BrowserWorkspaceController.prepareForExplicitNavigation(browserNetworkPolicy, browserWebView);
                    BrowserWorkspaceController.prepareTabsForExplicitNavigation(browserNetworkPolicy, browserTabs);
                    browserWebView.onResume();
                    browserWebView.resumeTimers();
                } catch (SecurityException denied) {
                    setBrowserOnlineEnabled(false);
                    if (browserOnlineToggle != null) browserOnlineToggle.setChecked(false);
                    showBrowserStatus("Online access is unavailable. No page was opened; Daymark remains offline.");
                    return;
                }
            }
            // Continue to load for permitted schemes even if offline
        } else {
            showBrowserOfflineStatus();
            return;
        }
        if (!ensureBrowserWebView()) {
            showBrowserOfflineStatus();
            return;
        }
'''
new = '''        if (!(BrowserUriRoutingPolicy.isOfflinePermittedWebViewScheme(scheme) || browserNetworkPolicy.allowsRemoteLoads())) {
            showBrowserOfflineStatus();
            return;
        }
        if (!ensureBrowserWebView(BrowserUriRoutingPolicy.isOfflinePermittedWebViewScheme(scheme))) {
            showBrowserOfflineStatus();
            return;
        }
        if (browserNetworkPolicy.allowsRemoteLoads()) {
            try {
                BrowserWorkspaceController.prepareForExplicitNavigation(browserNetworkPolicy, browserWebView);
                BrowserWorkspaceController.prepareTabsForExplicitNavigation(browserNetworkPolicy, browserTabs);
                browserWebView.onResume();
                browserWebView.resumeTimers();
            } catch (SecurityException denied) {
                setBrowserOnlineEnabled(false);
                if (browserOnlineToggle != null) browserOnlineToggle.setChecked(false);
                showBrowserStatus("Online access is unavailable. No page was opened; Daymark remains offline.");
                return;
            }
        }
'''
if old in text:
    text = text.replace(old, new, 1)
old_chip = '''        chip.setBackground(pressable(palette.surface, 20, palette.line, palette.text, palette.muted));
        chip.addView(text(label, 12, palette.text, Typeface.NORMAL));
'''
new_chip = '''        chip.setBackground(pressable(palette.surface, 20, palette.line, palette.text, palette.muted));
        applyPressFeedback(chip);
        chip.addView(text(label, 12, palette.text, Typeface.NORMAL));
'''
idx = text.find('browserHomeChip')
idx2 = text.find('navigateFromInput')
if old_chip in text and idx >= 0 and idx2 > idx and 'applyPressFeedback(chip);' not in text[idx:idx2]:
    text = text.replace(old_chip, new_chip, 1)
old_rail = '            LinearLayout chip = browserHomeChip(labelText, "Open saved site " + origin, () -> navigateBrowserTo(origin));'
new_rail = '''            LinearLayout chip = browserHomeChip(labelText, "Open saved site " + origin, () -> {
                showBrowserStatus("Opening saved site…");
                navigateBrowserTo(origin);
            });'''
if old_rail in text:
    text = text.replace(old_rail, new_rail, 1)
path.write_text(text, encoding='utf-8')
assert 'return ensureBrowserWebView(false);' in text
print('ok', path.stat().st_size)
