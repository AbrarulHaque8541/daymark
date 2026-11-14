package com.abrar.daymark;

import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.widget.Toast;

/** Creates a fresh, browsable ACTION_VIEW intent and requires confirmation before launching it. */
final class BrowserUriHandoff {
    private BrowserUriHandoff() { }

    static Intent createBrowsableViewIntent(Uri uri, String packageName) {
        Intent external = new Intent(Intent.ACTION_VIEW, uri);
        external.addCategory(Intent.CATEGORY_BROWSABLE);
        if (packageName != null) external.setPackage(packageName);
        return external;
    }

    static void confirmAndOpen(Context context, Intent external, String address,
                               Runnable onUnavailable) {
        // Only URI, package and browsable category are passed through; never forward
        // an untrusted serialized Intent, selector, component, flags or arbitrary extras.
        Intent safeExternal = createBrowsableViewIntent(external.getData(), external.getPackage());
        PackageManager packageManager = context.getPackageManager();
        ResolveInfo resolved = null;
        try {
            resolved = packageManager.resolveActivity(safeExternal, PackageManager.MATCH_DEFAULT_ONLY);
        } catch (RuntimeException hiddenOrUnavailable) {
            // Implicit handler visibility can vary by Android version; the system chooser
            // remains the authority for unqualified ACTION_VIEW links.
        }
        if ((resolved == null || resolved.activityInfo == null) && safeExternal.getPackage() != null) {
            showUnavailable(context, onUnavailable);
            return;
        }
        String handler = "Android app chooser (compatible apps, if installed)";
        if (resolved != null && resolved.activityInfo != null) {
            CharSequence label = resolved.loadLabel(packageManager);
            handler = label == null || label.length() == 0
                    ? resolved.activityInfo.packageName : label.toString();
        }
        String confirmation = "Resolved destination: " + address
                + "\nAndroid handler: " + handler;
        new AlertDialog.Builder(context)
                .setTitle("Open in another app?")
                .setMessage("This link will leave Daymark and open in another app.\n\n" + confirmation)
                .setNegativeButton("Stay in Daymark", null)
                .setPositiveButton("Open", (dialog, which) -> {
                    try {
                        context.startActivity(Intent.createChooser(
                                safeExternal, "Choose an app — cancel to stay in Daymark"));
                    } catch (ActivityNotFoundException | SecurityException unavailable) {
                        if (onUnavailable != null) {
                            onUnavailable.run();
                        } else {
                            Toast.makeText(context,
                                    "No compatible app found. This page remains open.",
                                    Toast.LENGTH_SHORT).show();
                        }
                    }
                })
                .show();
    }

    private static void showUnavailable(Context context, Runnable onUnavailable) {
        Toast.makeText(context,
                onUnavailable == null
                        ? "No compatible Android app could be resolved. Nothing was opened."
                        : "No compatible Android app could be resolved. Opening its web fallback.",
                Toast.LENGTH_LONG).show();
        if (onUnavailable != null) onUnavailable.run();
    }
}
