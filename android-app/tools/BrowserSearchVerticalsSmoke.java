package com.abrar.daymark;

/** Host-run regressions for the opt-in search vertical filters (BrowserAddress). */
public final class BrowserSearchVerticalsSmoke {
    private BrowserSearchVerticalsSmoke() { }

    private static void expect(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    private static void expectIllegalArgument(Runnable action, String message) {
        try {
            action.run();
        } catch (IllegalArgumentException expected) {
            return;
        }
        throw new AssertionError(message);
    }

    private static String vertical(BrowserAddress.SearchEngine engine,
            BrowserAddress.SearchVertical vertical, String query) {
        return BrowserAddress.verticalSearchUrl(engine, vertical, query);
    }

    public static void main(String[] args) {
        expect("https://www.google.com/search?q=tiger&tbm=isch".equals(vertical(
                BrowserAddress.SearchEngine.GOOGLE, BrowserAddress.SearchVertical.IMAGES, "tiger")),
                "google images keeps the tbm parameter");
        expect("https://www.google.com/search?q=white+space&tbm=vid".equals(vertical(
                BrowserAddress.SearchEngine.GOOGLE, BrowserAddress.SearchVertical.VIDEOS, "white space")),
                "google videos encodes spaces as plus");
        expect("https://www.google.com/search?q=news&tbm=nws".equals(vertical(
                BrowserAddress.SearchEngine.GOOGLE, BrowserAddress.SearchVertical.NEWS, "news")),
                "google news keeps the tbm parameter");
        expect("https://www.google.com/maps/search/tiger".equals(vertical(
                BrowserAddress.SearchEngine.GOOGLE, BrowserAddress.SearchVertical.MAPS, "tiger")),
                "google maps uses the maps search path");
        expect("https://www.bing.com/images/search?q=tiger".equals(vertical(
                BrowserAddress.SearchEngine.BING, BrowserAddress.SearchVertical.IMAGES, "tiger")),
                "bing images uses the vertical subpath");
        expect("https://www.bing.com/maps?q=tiger".equals(vertical(
                BrowserAddress.SearchEngine.BING, BrowserAddress.SearchVertical.MAPS, "tiger")),
                "bing maps uses the maps endpoint");
        expect("https://duckduckgo.com/?q=tiger&iax=images&ia=images".equals(vertical(
                BrowserAddress.SearchEngine.DUCKDUCKGO, BrowserAddress.SearchVertical.IMAGES, "tiger")),
                "duckduckgo images uses the image vertical params");
        expect("https://duckduckgo.com/?q=tiger&iar=news&ia=news".equals(vertical(
                BrowserAddress.SearchEngine.DUCKDUCKGO, BrowserAddress.SearchVertical.NEWS, "tiger")),
                "duckduckgo news uses the news ranking param");
        expect("https://search.brave.com/images?q=tiger".equals(vertical(
                BrowserAddress.SearchEngine.BRAVE, BrowserAddress.SearchVertical.IMAGES, "tiger")),
                "brave images uses the vertical path");
        expect("https://www.startpage.com/sp/search?query=tiger&cat=video".equals(vertical(
                BrowserAddress.SearchEngine.STARTPAGE, BrowserAddress.SearchVertical.VIDEOS, "tiger")),
                "startpage videos uses the video category");
        expect("https://images.search.yahoo.com/search/images?p=tiger".equals(vertical(
                BrowserAddress.SearchEngine.YAHOO, BrowserAddress.SearchVertical.IMAGES, "tiger")),
                "yahoo images uses the images subdomain and p parameter");
        expect("https://www.ecosia.org/news?q=tiger".equals(vertical(
                BrowserAddress.SearchEngine.ECOSIA, BrowserAddress.SearchVertical.NEWS, "tiger")),
                "ecosia news uses the vertical path");
        expect("https://www.qwant.com/?q=tiger&t=news".equals(vertical(
                BrowserAddress.SearchEngine.QWANT, BrowserAddress.SearchVertical.NEWS, "tiger")),
                "qwant news uses the t parameter");
        expect("https://kagi.com/videos?q=tiger".equals(vertical(
                BrowserAddress.SearchEngine.KAGI, BrowserAddress.SearchVertical.VIDEOS, "tiger")),
                "kagi videos uses the vertical path");
        expect("https://yandex.com/images/search?text=tiger".equals(vertical(
                BrowserAddress.SearchEngine.YANDEX, BrowserAddress.SearchVertical.IMAGES, "tiger")),
                "yandex images uses the text parameter");
        expect("https://yandex.com/maps/?text=tiger".equals(vertical(
                BrowserAddress.SearchEngine.YANDEX, BrowserAddress.SearchVertical.MAPS, "tiger")),
                "yandex maps uses the text parameter");
        expect("https://duckduckgo.com/?q=x&iax=images&ia=images".equals(
                BrowserAddress.verticalSearchUrl(null, BrowserAddress.SearchVertical.IMAGES, "x")),
                "a null engine falls back to the default web engine");

        expect(BrowserAddress.supportedVerticals(BrowserAddress.SearchEngine.GOOGLE).length == 4,
                "google exposes four verticals");
        expect(BrowserAddress.supportedVerticals(BrowserAddress.SearchEngine.YANDEX).length == 3,
                "yandex exposes images, videos and maps");
        expect(BrowserAddress.supportedVerticals(BrowserAddress.SearchEngine.DUCKDUCKGO).length == 3,
                "duckduckgo exposes three verticals");
        expect(BrowserAddress.supportedVerticals(BrowserAddress.SearchEngine.MOJEEK).length == 0,
                "mojeek exposes no verticals");
        expect(BrowserAddress.supportedVerticals(BrowserAddress.SearchEngine.CHATGPT).length == 0,
                "ai assistants expose no search verticals");

        expect(!BrowserAddress.engineSupportsVertical(null, BrowserAddress.SearchVertical.IMAGES),
                "null engine must fail closed");
        expect(!BrowserAddress.engineSupportsVertical(BrowserAddress.SearchEngine.DUCKDUCKGO, null),
                "null vertical must fail closed");
        expectIllegalArgument(() -> vertical(BrowserAddress.SearchEngine.DUCKDUCKGO,
                BrowserAddress.SearchVertical.MAPS, "tiger"), "unsupported vertical must be refused");
        expectIllegalArgument(() -> vertical(BrowserAddress.SearchEngine.GOOGLE,
                BrowserAddress.SearchVertical.IMAGES, " "), "an empty query must be refused");
        expectIllegalArgument(() -> vertical(BrowserAddress.SearchEngine.GOOGLE,
                BrowserAddress.SearchVertical.IMAGES, null), "a null query must be refused");
        System.out.println("PASS BrowserSearchVerticalsSmoke");
    }
}
