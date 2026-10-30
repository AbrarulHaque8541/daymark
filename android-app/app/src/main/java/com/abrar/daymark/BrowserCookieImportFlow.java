package com.abrar.daymark;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.ProgressDialog;
import android.content.ActivityNotFoundException;
import android.content.DialogInterface;
import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.webkit.CookieManager;
import android.view.View;
import android.view.ViewGroup;
import android.widget.CheckBox;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.CharBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * User-initiated SAF cookie import flow, kept separate from the host screen until its current
 * owners finish their work. The host starts this flow from an explicit user action and forwards
 * onActivityResult(requestCode, resultCode, data) to this instance.
 *
 * <p>Only the URI returned by ACTION_OPEN_DOCUMENT is read. The provider grant is temporary:
 * this class never takes a persistable grant, stores the URI, scans other apps, or logs values.
 */
public final class BrowserCookieImportFlow {
    public static final int REQUEST_CODE = 7820;
    private static final int MAX_FILE_BYTES = 2 * 1024 * 1024;
    private static final int MAX_COOKIE_NAMES_PER_DOMAIN = 8;

    public interface Listener {
        void onCookieImportFinished(int imported, int rejected, int expired);
    }

    private final Activity activity;
    private final Listener listener;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Set<String> selectedDomains = new LinkedHashSet<>();

    private BrowserCookieImport.ParseResult parsed;
    private BrowserCookieImportPolicy.Preview preview;
    private List<BrowserCookieImport.Cookie> pendingCookies = Collections.emptyList();
    private AlertDialog activeDialog;
    private ProgressDialog progressDialog;
    private int pendingIndex;
    private int importedCount;
    private int rejectedCount;
    private int expiredDuringImport;
    private boolean importing;
    private boolean flushFailed;

    public BrowserCookieImportFlow(Activity activity, Listener listener) {
        if (activity == null) throw new IllegalArgumentException("Activity is required.");
        this.activity = activity;
        this.listener = listener;
    }

    /** Call only in response to a visible user action, such as a future browser settings row. */
    @SuppressWarnings("deprecation")
    public void start() {
        if (importing) return;
        Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        picker.addCategory(Intent.CATEGORY_OPENABLE);
        picker.setType("*/*");
        picker.putExtra(Intent.EXTRA_MIME_TYPES,
                new String[]{"text/plain", "application/octet-stream"});
        picker.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, false);
        picker.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            activity.startActivityForResult(picker, REQUEST_CODE);
        } catch (ActivityNotFoundException unavailable) {
            showToast("No document picker is available on this device.");
        }
    }

    /** Forward the host Activity result here; returns false for unrelated request codes. */
    public boolean onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != REQUEST_CODE) return false;
        if (resultCode != Activity.RESULT_OK || data == null || data.getData() == null) {
            clearSensitiveState();
            return true;
        }

        try {
            String text = readSelectedFile(data.getData());
            try {
                parsed = BrowserCookieImport.parse(text);
            } finally {
                text = null;
            }
            if (!parsed.recognizedFormat || parsed.isEmpty()) {
                clearSensitiveState();
                showMessage("Unsupported cookie export",
                        "Choose a valid Netscape cookies.txt export. No cookies were imported.");
                return true;
            }

            long now = System.currentTimeMillis() / 1000L;
            preview = BrowserCookieImportPolicy.createPreview(parsed, now);
            if (preview.tooManyDomains) {
                clearSensitiveState();
                showMessage("Export is too broad",
                        "This file contains more than "
                                + BrowserCookieImportPolicy.MAX_PREVIEW_DOMAINS
                                + " distinct domains. Split the export and review smaller files.");
                return true;
            }
            if (preview.importableCookieCount == 0) {
                String reason = "No importable cookies were found.";
                if (preview.expiredCookieCount > 0) {
                    reason += " " + preview.expiredCookieCount + " expired cookies were skipped.";
                }
                if (preview.prefixRejectedCookieCount > 0) {
                    reason += " " + preview.prefixRejectedCookieCount
                            + " cookies failed __Secure-/__Host- prefix rules.";
                }
                clearSensitiveState();
                showMessage("Nothing to import", reason);
                return true;
            }
            showPreview();
        } catch (IOException | RuntimeException failure) {
            clearSensitiveState();
            showMessage("Could not read cookie export",
                    "The selected document could not be read as a bounded UTF-8 text export. "
                            + "No cookies were imported.");
        }
        return true;
    }

    /** Release in-memory references when the host abandons this flow. */
    public void cancel() {
        if (!importing) clearSensitiveState();
    }

    private String readSelectedFile(Uri selectedUri) throws IOException {
        byte[] bytes = new byte[MAX_FILE_BYTES + 1];
        try (InputStream input = activity.getContentResolver().openInputStream(selectedUri)) {
            if (input == null) throw new IOException("Selected document could not be opened.");
            int total = 0;
            while (total < bytes.length) {
                int count = input.read(bytes, total, bytes.length - total);
                if (count < 0) break;
                if (count == 0) {
                    int single = input.read();
                    if (single < 0) break;
                    bytes[total++] = (byte) single;
                } else {
                    total += count;
                }
            }
            if (total > MAX_FILE_BYTES) throw new IOException("Selected document exceeds the size limit.");

            CharBuffer decoded = StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(bytes, 0, total));
            String text = decoded.toString();
            return text.startsWith("\uFEFF") ? text.substring(1) : text;
        } catch (CharacterCodingException invalidUtf8) {
            throw new IOException("Selected document is not valid UTF-8.", invalidUtf8);
        } finally {
            Arrays.fill(bytes, (byte) 0);
        }
    }

    private void showPreview() {
        ScrollView scroll = new ScrollView(activity);
        LinearLayout content = new LinearLayout(activity);
        content.setOrientation(LinearLayout.VERTICAL);
        int padding = dp(18);
        content.setPadding(padding, padding, padding, padding);
        scroll.addView(content, new ScrollView.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        addText(content, "Review the domains and cookie metadata before continuing.", 16, true);
        addText(content, "Cookie values are hidden. Expired cookies and cookies that violate "
                + "__Secure-/__Host- prefix rules are excluded. Netscape exports do not preserve "
                + "SameSite metadata.", 14, false);

        StringBuilder counts = new StringBuilder();
        counts.append(preview.importableCookieCount).append(" importable · ")
                .append(preview.expiredCookieCount).append(" expired · ")
                .append(preview.prefixRejectedCookieCount).append(" prefix-rejected · ")
                .append(preview.rejectedLineCount).append(" malformed rows");
        if (preview.rejectionListTruncated) counts.append(" (details capped)");
        addText(content, counts.toString(), 14, true);

        for (BrowserCookieImportPolicy.DomainPreview domain : preview.domains) {
            CheckBox choice = new CheckBox(activity);
            choice.setText(domain.domain + " · " + domain.cookies.size() + " cookies");
            choice.setPadding(0, dp(8), 0, dp(2));
            choice.setOnCheckedChangeListener((button, checked) -> {
                if (checked) selectedDomains.add(domain.domain);
                else selectedDomains.remove(domain.domain);
                if (activeDialog != null && activeDialog.isShowing()) {
                    activeDialog.getButton(DialogInterface.BUTTON_POSITIVE)
                            .setEnabled(!selectedDomains.isEmpty());
                }
            });
            content.addView(choice);

            StringBuilder details = new StringBuilder();
            details.append(domain.secureCount).append(" Secure · ")
                    .append(domain.httpOnlyCount).append(" HttpOnly · ")
                    .append(domain.sessionCount).append(" session");
            int shown = Math.min(MAX_COOKIE_NAMES_PER_DOMAIN, domain.cookies.size());
            for (int i = 0; i < shown; i++) {
                BrowserCookieImport.Cookie cookie = domain.cookies.get(i);
                details.append("\n• ").append(cookie.name).append("  ").append(cookie.path);
                if (cookie.secure) details.append("  Secure");
                if (cookie.httpOnly) details.append("  HttpOnly");
            }
            if (domain.cookies.size() > shown) {
                details.append("\n• +").append(domain.cookies.size() - shown)
                        .append(" more cookie names");
            }
            addText(content, details.toString(), 13, false);
        }

        AlertDialog dialog = new AlertDialog.Builder(activity)
                .setTitle("Cookie import preview")
                .setView(scroll)
                .setNegativeButton("Cancel", (ignored, which) -> clearSensitiveState())
                .setPositiveButton("Review import", null)
                .create();
        activeDialog = dialog;
        dialog.setOnCancelListener(ignored -> clearSensitiveState());
        dialog.setOnShowListener(ignored -> {
            dialog.getButton(DialogInterface.BUTTON_POSITIVE).setEnabled(false);
            dialog.getButton(DialogInterface.BUTTON_POSITIVE).setOnClickListener(view -> {
                if (selectedDomains.isEmpty()) return;
                dialog.dismiss();
                activeDialog = null;
                showConfirmation();
            });
        });
        dialog.show();
    }

    private void showConfirmation() {
        List<BrowserCookieImport.Cookie> selected =
                BrowserCookieImportPolicy.selectCookies(preview, selectedDomains);
        if (selected.isEmpty()) {
            clearSensitiveState();
            showMessage("No domains selected", "Select at least one domain to continue.");
            return;
        }

        LinearLayout content = new LinearLayout(activity);
        content.setOrientation(LinearLayout.VERTICAL);
        int padding = dp(18);
        content.setPadding(padding, padding, padding, padding);
        StringBuilder domains = new StringBuilder();
        int shown = 0;
        for (String domain : selectedDomains) {
            if (shown++ > 0) domains.append(", ");
            if (shown > 8) {
                domains.append("and ").append(selectedDomains.size() - 8).append(" more");
                break;
            }
            domains.append(domain);
        }
        addText(content, "Add " + selected.size() + " cookies for " + domains
                + " to Daymark's WebView cookie store? Imported cookies are sign-in credentials "
                + "and may grant access to the listed websites. They remain until they expire "
                + "or browser site data is cleared.", 15, false);
        CheckBox acknowledgement = new CheckBox(activity);
        acknowledgement.setText("I understand these cookies are session credentials.");
        content.addView(acknowledgement);

        AlertDialog dialog = new AlertDialog.Builder(activity)
                .setTitle("Confirm cookie import")
                .setView(content)
                .setNegativeButton("Cancel", (ignored, which) -> clearSensitiveState())
                .setPositiveButton("Import selected", null)
                .create();
        activeDialog = dialog;
        dialog.setOnCancelListener(ignored -> clearSensitiveState());
        dialog.setOnShowListener(ignored -> {
            dialog.getButton(DialogInterface.BUTTON_POSITIVE).setEnabled(false);
            acknowledgement.setOnCheckedChangeListener((button, checked) ->
                    dialog.getButton(DialogInterface.BUTTON_POSITIVE).setEnabled(checked));
            dialog.getButton(DialogInterface.BUTTON_POSITIVE).setOnClickListener(view -> {
                dialog.dismiss();
                activeDialog = null;
                beginImport(selected);
            });
        });
        dialog.show();
    }

    private void beginImport(List<BrowserCookieImport.Cookie> selected) {
        pendingCookies = new ArrayList<>(selected);
        pendingIndex = 0;
        importedCount = 0;
        rejectedCount = 0;
        expiredDuringImport = 0;
        flushFailed = false;
        importing = true;
        try {
            progressDialog = new ProgressDialog(activity);
            progressDialog.setTitle("Importing cookies");
            progressDialog.setMessage("Writing only the domains you selected…");
            progressDialog.setIndeterminate(true);
            progressDialog.setCancelable(false);
            progressDialog.show();
            applyNextCookie(CookieManager.getInstance());
        } catch (RuntimeException unavailable) {
            rejectedCount = pendingCookies.size();
            finishImport(false);
        }
    }

    private void applyNextCookie(CookieManager cookieManager) {
        if (pendingIndex >= pendingCookies.size()) {
            finishImport(true);
            return;
        }

        BrowserCookieImport.Cookie cookie = pendingCookies.get(pendingIndex++);
        long now = System.currentTimeMillis() / 1000L;
        String header = BrowserCookieImportPolicy.buildSetCookieHeader(cookie, now);
        if (header == null) {
            expiredDuringImport++;
            mainHandler.post(() -> applyNextCookie(cookieManager));
            return;
        }

        try {
            cookieManager.setCookie(BrowserCookieImportPolicy.targetUrl(cookie), header, accepted -> {
                if (Boolean.TRUE.equals(accepted)) importedCount++;
                else rejectedCount++;
                mainHandler.post(() -> applyNextCookie(cookieManager));
            });
        } catch (RuntimeException rejectedCookie) {
            rejectedCount++;
            mainHandler.post(() -> applyNextCookie(cookieManager));
        }
    }

    private void finishImport(boolean flush) {
        if (flush) {
            try {
                CookieManager.getInstance().flush();
            } catch (RuntimeException ignored) {
                flushFailed = true;
            }
        }
        importing = false;
        if (progressDialog != null) {
            try {
                progressDialog.dismiss();
            } catch (RuntimeException ignored) {
                // The host may already be finishing.
            }
            progressDialog = null;
        }

        int imported = importedCount;
        int webViewRejected = rejectedCount;
        int malformedRows = preview == null ? 0 : preview.rejectedLineCount;
        int prefixRejected = preview == null ? 0 : preview.prefixRejectedCookieCount;
        int rejected = webViewRejected + malformedRows + prefixRejected;
        int expired = preview == null ? expiredDuringImport
                : preview.expiredCookieCount + expiredDuringImport;
        boolean storeFlushFailed = flushFailed;
        if (listener != null) {
            try {
                listener.onCookieImportFinished(imported, rejected, expired);
            } catch (RuntimeException ignored) {
                // A host callback must not interrupt cleanup of in-memory cookie values.
            }
        }
        clearSensitiveState();
        if (activity.isFinishing() || activity.isDestroyed()) return;

        String message = "Imported: " + imported + "\nRejected by WebView: " + webViewRejected
                + "\nMalformed rows skipped: " + malformedRows
                + "\nPrefix-rule violations skipped: " + prefixRejected
                + "\nExpired/skipped: " + expired;
        if (storeFlushFailed) message += "\n\nThe WebView cookie store could not confirm a flush.";
        message += "\n\nCookie values were not displayed or written to logs.";
        showMessage("Cookie import result", message);
    }

    private void addText(LinearLayout parent, String text, int sizeSp, boolean bold) {
        TextView view = new TextView(activity);
        view.setText(text);
        view.setTextSize(sizeSp);
        if (bold) view.setTypeface(view.getTypeface(), android.graphics.Typeface.BOLD);
        view.setPadding(0, dp(5), 0, dp(7));
        parent.addView(view, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
    }

    private int dp(int value) {
        return Math.round(value * activity.getResources().getDisplayMetrics().density);
    }

    private void showToast(String message) {
        if (!activity.isFinishing() && !activity.isDestroyed()) {
            Toast.makeText(activity, message, Toast.LENGTH_LONG).show();
        }
    }

    private void showMessage(String title, String message) {
        if (activity.isFinishing() || activity.isDestroyed()) return;
        new AlertDialog.Builder(activity)
                .setTitle(title)
                .setMessage(message)
                .setPositiveButton("OK", null)
                .show();
    }

    private void clearSensitiveState() {
        parsed = null;
        preview = null;
        selectedDomains.clear();
        pendingCookies = Collections.emptyList();
        pendingIndex = 0;
        activeDialog = null;
    }
}
