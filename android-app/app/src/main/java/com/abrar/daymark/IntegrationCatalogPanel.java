package com.abrar.daymark;
import android.content.Context;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.HapticFeedbackConstants;
import android.view.inputmethod.EditorInfo;
import android.widget.Button;
import android.widget.EditText;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.util.Locale;

/**
 * Reusable Connections panel. The host owns navigation and execution; only catalog entries
 * marked AVAILABLE can emit an onUse callback. Roadmap providers never show an active Connect action.
 */
final class IntegrationCatalogPanel extends LinearLayout {
    interface Listener {
        void onUse(IntegrationCatalog.Entry entry);
    }

    private final Context context;
    private final LinearLayout familyRow;
    private final LinearLayout entryColumn;
    private final EditText search;
    private IntegrationCatalog.Family selectedFamily;
    private Listener listener;

    IntegrationCatalogPanel(Context context, Listener listener) {
        super(context);
        this.context = context;
        this.listener = listener;
        setOrientation(VERTICAL);
        setPadding(dp(16), dp(12), dp(16), dp(16));

        TextView title = new TextView(context);
        title.setText("Connections");
        title.setTextSize(22);
        title.setTypeface(title.getTypeface(), android.graphics.Typeface.BOLD);
        addView(title, matchWrap());

        TextView disclosure = new TextView(context);
        disclosure.setText("Connect Daymark to apps and services. Only integrations marked Available can be opened; planned providers are shown honestly.");
        disclosure.setTextSize(13);
        addView(disclosure, matchWrap());

        search = new EditText(context);
        search.setSingleLine(true);
        search.setImeOptions(EditorInfo.IME_ACTION_SEARCH);
        search.setHint("Search apps, services and protocols");
        search.setContentDescription("Search integrations");
        search.setMinHeight(dp(48));
        search.setMinimumHeight(dp(48));
        addView(search, new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT));

        HorizontalScrollView familyScroll = new HorizontalScrollView(context);
        familyScroll.setHorizontalScrollBarEnabled(false);
        familyRow = new LinearLayout(context);
        familyRow.setOrientation(HORIZONTAL);
        familyScroll.addView(familyRow, new HorizontalScrollView.LayoutParams(
                LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT));
        addView(familyScroll, matchWrap());

        ScrollView scroll = new ScrollView(context);
        entryColumn = new LinearLayout(context);
        entryColumn.setOrientation(VERTICAL);
        scroll.addView(entryColumn, new ScrollView.LayoutParams(
                LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT));
        addView(scroll, new LayoutParams(LayoutParams.MATCH_PARENT, 0, 1f));

        search.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) { }
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) {
                renderEntries();
            }
            @Override public void afterTextChanged(Editable s) { }
        });
        renderFamilies();
        renderEntries();
    }

    void setListener(Listener listener) {
        this.listener = listener;
        renderEntries();
    }

    private void renderFamilies() {
        // Build once: replacing the focused chip on every selection loses keyboard/TalkBack focus.
        if (familyRow.getChildCount() == 0) {
            addFamilyChip(null, "All");
            for (IntegrationCatalog.Family family : IntegrationCatalog.Family.values()) {
                addFamilyChip(family, familyLabel(family));
            }
        }
        for (int index = 0; index < familyRow.getChildCount(); index++) {
            Button chip = (Button) familyRow.getChildAt(index);
            IntegrationCatalog.Family family = (IntegrationCatalog.Family) chip.getTag();
            String label = family == null ? "All" : familyLabel(family);
            boolean selected = selectedFamily == family;
            chip.setSelected(selected);
            chip.setText((selected ? "✓  " : "") + label);
            chip.setContentDescription("Filter integrations: " + label
                    + (selected ? ", selected" : ", not selected"));
        }
    }

    private void addFamilyChip(IntegrationCatalog.Family family, String label) {
        Button chip = new Button(context);
        chip.setText(label);
        chip.setAllCaps(false);
        chip.setTag(family);
        chip.setMinHeight(dp(48));
        chip.setMinimumHeight(dp(48));
        chip.setOnClickListener(view -> {
            if (selectedFamily == family) return;
            selectedFamily = family;
            view.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
            renderFamilies();
            renderEntries();
        });
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT);
        params.setMargins(0, 0, dp(6), dp(6));
        familyRow.addView(chip, params);
    }

    private void renderEntries() {
        entryColumn.removeAllViews();
        String query = search.getText() == null ? "" : search.getText().toString().trim()
                .toLowerCase(Locale.ROOT);
        int shown = 0;
        for (IntegrationCatalog.Entry entry : IntegrationCatalog.all()) {
            if (selectedFamily != null && entry.family != selectedFamily) continue;
            String haystack = (entry.name + " " + entry.summary + " " + entry.requirement
                    + " " + entry.family.name()).toLowerCase(Locale.ROOT);
            if (!query.isEmpty() && !haystack.contains(query)) continue;
            addEntry(entry);
            shown++;
        }
        if (shown == 0) {
            TextView empty = new TextView(context);
            empty.setText("No matching integrations. Try another search or choose All.");
            empty.setPadding(0, dp(16), 0, dp(16));
            entryColumn.addView(empty, matchWrap());
        }
    }

    private void addEntry(IntegrationCatalog.Entry entry) {
        LinearLayout card = new LinearLayout(context);
        card.setOrientation(VERTICAL);
        card.setPadding(dp(12), dp(10), dp(12), dp(10));

        TextView name = new TextView(context);
        name.setText(entry.name);
        name.setTextSize(16);
        name.setTypeface(name.getTypeface(), android.graphics.Typeface.BOLD);
        card.addView(name, matchWrap());

        TextView metadata = new TextView(context);
        metadata.setText(familyLabel(entry.family) + " · " + entry.level.name().replace('_', ' '));
        metadata.setTextSize(11);
        card.addView(metadata, matchWrap());

        TextView summary = new TextView(context);
        summary.setText(entry.summary);
        summary.setTextSize(13);
        card.addView(summary, matchWrap());

        TextView requirement = new TextView(context);
        requirement.setText(entry.statusLabel() + " · " + entry.requirement);
        requirement.setTextSize(12);
        requirement.setContentDescription(entry.name + " status: " + entry.statusLabel()
                + ". " + entry.requirement);
        card.addView(requirement, matchWrap());

        Button action = new Button(context);
        action.setAllCaps(false);
        action.setMinHeight(dp(48));
        action.setMinimumHeight(dp(48));
        if (entry.canConnect() && listener != null) {
            action.setText("Use");
            action.setContentDescription("Use " + entry.name);
            action.setEnabled(true);
            action.setOnClickListener(view -> {
                view.performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
                Listener current = listener;
                if (current != null && entry.canConnect()) current.onUse(entry);
            });
        } else {
            action.setText(entry.canConnect() ? "Action unavailable" : entry.statusLabel());
            action.setContentDescription(entry.name + ": "
                    + (entry.canConnect() ? "Action unavailable" : entry.statusLabel()));
            action.setEnabled(false);
        }
        card.addView(action, new LayoutParams(LayoutParams.WRAP_CONTENT, LayoutParams.WRAP_CONTENT));

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT);
        params.setMargins(0, 0, 0, dp(8));
        entryColumn.addView(card, params);
    }

    private static String familyLabel(IntegrationCatalog.Family family) {
        if (family == IntegrationCatalog.Family.AI_TOOLS) return "AI tools";
        String label = family.name().replace('_', ' ').toLowerCase(Locale.ROOT);
        return Character.toUpperCase(label.charAt(0)) + label.substring(1);
    }

    private LayoutParams matchWrap() {
        return new LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }
}
