package com.abrar.daymark;

/** JDK-only check that the established Daymark system-splash branding copy is unchanged. */
public final class SplashPolicySmoke {
    private SplashPolicySmoke() { }

    public static void main(String[] args) {
        assert "DAYMARK".equals(SplashPolicy.BRAND_TITLE) : "splash title must preserve DAYMARK";
        assert "BY ABRARUL HAQUE".equals(SplashPolicy.BRAND_SUBTITLE)
                : "splash attribution must preserve BY ABRARUL HAQUE";
        System.out.println("PASS splash brand copy: DAYMARK / BY ABRARUL HAQUE");
    }
}
