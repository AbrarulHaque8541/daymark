package android.os;

/** Minimal deterministic host-test stub for the Android main Looper. */
public final class Looper {
    private static final Looper MAIN = new Looper();
    private Looper() {}
    public static Looper getMainLooper() { return MAIN; }
}
