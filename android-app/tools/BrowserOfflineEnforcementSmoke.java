package com.abrar.daymark;

import java.util.Arrays;
import java.util.List;

/** JDK-only regressions for Offline teardown when one WebView renderer has exited. */
public final class BrowserOfflineEnforcementSmoke {
    private BrowserOfflineEnforcementSmoke() { }

    private static final class FakeTab implements BrowserOfflineEnforcement.Tab {
        int blockCalls;
        int stopCalls;
        boolean throwOnBlock;
        boolean throwOnStop;

        @Override public void blockNetworkLoads(boolean blocked) {
            blockCalls++;
            assert blocked : "Offline teardown must block remote loads";
            if (throwOnBlock) throw new IllegalStateException("renderer gone");
        }

        @Override public void stopLoading() {
            stopCalls++;
            if (throwOnStop) throw new IllegalStateException("renderer gone");
        }
    }

    public static void main(String[] args) {
        FakeTab untouched = new FakeTab();
        BrowserOfflineEnforcement.enforceOffline(
                new BrowserNetworkPolicy(true), List.of(untouched));
        assert untouched.blockCalls == 0 && untouched.stopCalls == 0
                : "Online policy must not stop or block tabs";

        FakeTab deadRenderer = new FakeTab();
        deadRenderer.throwOnBlock = true;
        deadRenderer.throwOnStop = true;
        FakeTab healthy = new FakeTab();
        BrowserOfflineEnforcement.enforceOffline(
                new BrowserNetworkPolicy(false), Arrays.asList(deadRenderer, null, healthy));

        assert deadRenderer.blockCalls == 1 : "block attempt must be made even for a dead renderer";
        assert deadRenderer.stopCalls == 1 : "stop attempt must be independent of block failure";
        assert healthy.blockCalls == 1 && healthy.stopCalls == 1
                : "one dead renderer must not prevent enforcement on remaining tabs";

        BrowserOfflineEnforcement.enforceOffline(null, List.of(healthy));
        BrowserOfflineEnforcement.enforceOffline(new BrowserNetworkPolicy(false), null);
        assert healthy.blockCalls == 1 && healthy.stopCalls == 1
                : "missing policy/tab collection must be a no-op";

        System.out.println("PASS browser Offline enforcement: Online no-op; renderer exceptions isolated; all remaining tabs blocked/stopped");
    }
}
