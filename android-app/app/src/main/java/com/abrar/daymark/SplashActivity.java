package com.abrar.daymark;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

import androidx.core.splashscreen.SplashScreen;

/**
 * Routes the launcher start to the real app while keeping AndroidX's system splash visible.
 *
 * <p>This activity deliberately does not render a second splash layout. Its launch window uses
 * the same system splash on Android 8.0+; holding that window until MainActivity is started avoids
 * the duplicate system-then-custom splash that Android 12+ otherwise shows.
 */
public final class SplashActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        SplashScreen splashScreen = SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);

        // Keep the one system splash through this zero-UI routing activity and into the app.
        splashScreen.setKeepOnScreenCondition(() -> true);

        Intent intent = new Intent(this, MainActivity.class);
        // Preserve the original launch details for any existing launcher/deep-link routing.
        Intent original = getIntent();
        if (original != null) {
            if (original.getAction() != null) intent.setAction(original.getAction());
            if (original.getData() != null) intent.setData(original.getData());
            if (original.getExtras() != null) intent.putExtras(original.getExtras());
        }
        startActivity(intent);
        finish();
    }
}
