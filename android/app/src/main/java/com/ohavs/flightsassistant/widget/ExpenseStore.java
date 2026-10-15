package com.ohavs.flightsassistant.widget;

import android.annotation.SuppressLint;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.os.Build;
import android.util.Log;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.text.SimpleDateFormat;
import java.util.Collection;
import java.util.Date;
import java.util.Iterator;
import java.util.Locale;
import java.util.TimeZone;

/**
 * Expenses added on the home screen (ExpenseWidget, ExpenseSheetActivity),
 * written to Firestore without opening the app. The app hands over its
 * sign-in (TripWidgetPlugin.auth: the user's refresh token and the web
 * config); this trades it for an ID token and commits the same document the
 * expenses tab writes (ExpensesTab.jsx). Learned from Payments.
 *
 * Offline, or with no usable sign-in, the expense waits in a queue:
 * ExpenseFlushJob sends it once the phone is online, and the app sends it
 * through its own SDK when it opens (src/lib/native/widget.js). Either may
 * win; the document id is fixed, so the other finds it there.
 *
 * The sign-in has its own prefs file, left out of backups
 * (xml/backup_rules, xml/data_extraction_rules).
 */
final class ExpenseStore {
    private ExpenseStore() {}

    private static final String TAG = "ExpenseWidget";
    static final String AUTH = "expense_auth";
    private static final String QUEUE = "expense_queue";
    private static final int JOB_ID = 0x45585053;
    private static final Object LOCK = new Object();

    enum Result { SAVED, OFFLINE, SIGNED_OUT, DENIED }

    /** The sign-in is missing, refused, or for someone else. */
    static final class AuthException extends Exception {
        AuthException(String why) { super(why); }
    }

    /** Firestore will not take it (permissions, a trip that is gone). */
    static final class DeniedException extends Exception {
        DeniedException(String why) { super(why); }
    }

    // ── The sign-in ──────────────────────────────────────────────────────

    private static SharedPreferences auth(Context ctx) {
        return ctx.getSharedPreferences(AUTH, Context.MODE_PRIVATE);
    }

    /** { uid, refreshToken, apiKey, projectId }, or null when signed out. */
    static void setAuth(Context ctx, JSONObject a) {
        SharedPreferences p = auth(ctx);
        if (a == null || a.optString("uid").isEmpty() || a.optString("refreshToken").isEmpty()) {
            p.edit().clear().apply();
            return;
        }
        SharedPreferences.Editor e = p.edit();
        if (!a.optString("uid").equals(p.getString("uid", null))) e.remove("idToken").remove("idExpires");
        e.putString("uid", a.optString("uid"))
            .putString("refreshToken", a.optString("refreshToken"))
            .putString("apiKey", a.optString("apiKey"))
            .putString("projectId", a.optString("projectId"))
            .apply();
    }

    static String uid(Context ctx) {
        return auth(ctx).getString("uid", null);
    }

    // ── The document ─────────────────────────────────────────────────────

    /**
     * A queued expense: { id, tripId, uid, doc }, doc as ExpensesTab writes
     * it. placeId: a place in the planning tab; else place is typed (or a
     * plan item with no place) and goes in customPlace. ils: the amount in
     * shekels at today's rate, or null.
     */
    static JSONObject expense(String uid, String tripId, double amount, String currency, String category,
                              String placeId, String place, Double ils, long now) throws JSONException {
        SimpleDateFormat iso = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        iso.setTimeZone(TimeZone.getTimeZone("UTC"));
        JSONObject doc = new JSONObject()
            .put("amount", amount)
            .put("currency", currency)
            .put("category", category == null || category.isEmpty() ? "כללי" : category)
            .put("description", "")
            .put("linkedPlanId", placeId == null || placeId.isEmpty() ? JSONObject.NULL : placeId)
            .put("customPlace", (placeId == null || placeId.isEmpty()) && place != null && !place.trim().isEmpty()
                ? place.trim() : JSONObject.NULL)
            .put("ilsSnapshot", "ILS".equals(currency) || ils == null ? JSONObject.NULL : ils)
            .put("paidBy", uid)
            .put("createdAt", iso.format(new Date(now)));
        return new JSONObject().put("id", "exp-" + now).put("tripId", tripId).put("uid", uid).put("doc", doc);
    }

    // ── Saving ───────────────────────────────────────────────────────────

    /** Writes it now, or queues it; DENIED is neither. Off the main thread. */
    static Result save(Context ctx, JSONObject e) {
        if (!e.optString("uid").equals(uid(ctx))) {
            enqueue(ctx, e);
            return Result.SIGNED_OUT;
        }
        if (!online(ctx)) {
            enqueue(ctx, e);
            schedule(ctx);
            return Result.OFFLINE;
        }
        try {
            write(ctx, e);
            if (!flush(ctx)) schedule(ctx);   // anything an earlier save left behind
            return Result.SAVED;
        } catch (AuthException x) {
            Log.w(TAG, "not signed in: " + x.getMessage());
            enqueue(ctx, e);
            return Result.SIGNED_OUT;
        } catch (DeniedException x) {
            Log.w(TAG, "refused: " + x.getMessage());
            return Result.DENIED;
        } catch (IOException | JSONException x) {
            Log.w(TAG, "no connection: " + x);
            enqueue(ctx, e);
            schedule(ctx);
            return Result.OFFLINE;
        }
    }

    /**
     * Sends what waits in the queue. False when the connection is still out
     * and it should try again later; an expense Firestore refuses is dropped.
     */
    static boolean flush(Context ctx) {
        JSONArray q = pending(ctx);
        for (int i = 0; i < q.length(); i++) {
            JSONObject e = q.optJSONObject(i);
            if (e == null) continue;
            try {
                if (!e.optString("uid").equals(uid(ctx))) continue;   // the app sends it, signed in as them
                write(ctx, e);
                remove(ctx, java.util.Collections.singleton(e.optString("id")));
            } catch (AuthException x) {
                return true;   // the app sends it when it next opens
            } catch (DeniedException x) {
                Log.w(TAG, "dropped " + e.optString("id") + ": " + x.getMessage());
                remove(ctx, java.util.Collections.singleton(e.optString("id")));
            } catch (IOException | JSONException x) {
                return false;
            }
        }
        return true;
    }

    private static void write(Context ctx, JSONObject e) throws IOException, AuthException, DeniedException, JSONException {
        try {
            commit(ctx, e, token(ctx, false));
        } catch (AuthException x) {
            // A token the server no longer takes: once more with a fresh one.
            commit(ctx, e, token(ctx, true));
        }
    }

    // ── The queue ────────────────────────────────────────────────────────

    static JSONArray pending(Context ctx) {
        synchronized (LOCK) {
            try {
                return new JSONArray(ctx.getSharedPreferences(QUEUE, Context.MODE_PRIVATE).getString("pending", "[]"));
            } catch (JSONException x) {
                return new JSONArray();
            }
        }
    }

    private static void enqueue(Context ctx, JSONObject e) {
        synchronized (LOCK) {
            JSONArray q = pending(ctx);
            q.put(e);
            store(ctx, q);
        }
    }

    static void remove(Context ctx, Collection<String> ids) {
        synchronized (LOCK) {
            JSONArray q = pending(ctx), keep = new JSONArray();
            for (int i = 0; i < q.length(); i++) {
                JSONObject e = q.optJSONObject(i);
                if (e != null && !ids.contains(e.optString("id"))) keep.put(e);
            }
            store(ctx, keep);
        }
    }

    private static void store(Context ctx, JSONArray q) {
        ctx.getSharedPreferences(QUEUE, Context.MODE_PRIVATE).edit().putString("pending", q.toString()).commit();
    }

    /** ExpenseFlushJob, as soon as there is a network. */
    static void schedule(Context ctx) {
        JobScheduler js = (JobScheduler) ctx.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (js == null) return;
        js.schedule(new JobInfo.Builder(JOB_ID, new ComponentName(ctx, ExpenseFlushJob.class))
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
            .setBackoffCriteria(60_000L, JobInfo.BACKOFF_POLICY_EXPONENTIAL)
            .setPersisted(false)
            .build());
    }

    @SuppressWarnings("deprecation")
    private static boolean online(Context ctx) {
        ConnectivityManager cm = (ConnectivityManager) ctx.getSystemService(Context.CONNECTIVITY_SERVICE);
        NetworkInfo n = cm == null ? null : cm.getActiveNetworkInfo();
        return n != null && n.isConnected();
    }

    // ── Firebase, over REST ──────────────────────────────────────────────

    /** An ID token: the one kept, or traded for the refresh token. */
    private static String token(Context ctx, boolean fresh) throws IOException, AuthException, JSONException {
        SharedPreferences p = auth(ctx);
        String id = p.getString("idToken", null);
        if (!fresh && id != null && System.currentTimeMillis() < p.getLong("idExpires", 0)) return id;
        String refresh = p.getString("refreshToken", null), key = p.getString("apiKey", null);
        if (refresh == null || key == null || key.isEmpty()) throw new AuthException("no sign-in");
        HttpURLConnection c = open(ctx, "https://securetoken.googleapis.com/v1/token?key=" + enc(key));
        c.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
        send(c, "grant_type=refresh_token&refresh_token=" + enc(refresh));
        int code = c.getResponseCode();
        String body = read(c, code);
        if (code == 400) {
            String why = errorOf(body);
            // Signed out elsewhere, or the account is gone: the app signs in again.
            if (why.contains("TOKEN_EXPIRED") || why.contains("INVALID_REFRESH_TOKEN")
                || why.contains("USER_DISABLED") || why.contains("USER_NOT_FOUND")) {
                p.edit().remove("refreshToken").remove("idToken").remove("idExpires").apply();
            }
            throw new AuthException("token " + why);
        }
        if (code == 401 || code == 403) throw new AuthException("token " + code + " " + errorOf(body));
        if (code != 200) throw new IOException("token " + code);
        JSONObject r = new JSONObject(body);
        if (!r.optString("user_id").equals(p.getString("uid", ""))) throw new AuthException("another account");
        id = r.getString("id_token");
        long life = Long.parseLong(r.optString("expires_in", "3600"));
        SharedPreferences.Editor e = p.edit()
            .putString("idToken", id)
            .putLong("idExpires", System.currentTimeMillis() + Math.max(60, life - 120) * 1000L);
        String next = r.optString("refresh_token");
        if (!next.isEmpty()) e.putString("refreshToken", next);
        e.apply();
        return id;
    }

    private static void commit(Context ctx, JSONObject e, String token) throws IOException, AuthException, DeniedException, JSONException {
        String project = auth(ctx).getString("projectId", "");
        String base = "projects/" + project + "/databases/(default)/documents";
        JSONObject fields = new JSONObject();
        JSONObject doc = e.getJSONObject("doc");
        for (Iterator<String> it = doc.keys(); it.hasNext(); ) {
            String k = it.next();
            fields.put(k, value(doc.opt(k)));
        }
        JSONObject write = new JSONObject()
            .put("update", new JSONObject()
                .put("name", base + "/trips/" + e.getString("tripId") + "/expenses/" + e.getString("id"))
                .put("fields", fields))
            // Never over another document: a retry finds its own already there.
            .put("currentDocument", new JSONObject().put("exists", false));
        HttpURLConnection c = open(ctx, "https://firestore.googleapis.com/v1/" + base + ":commit");
        c.setRequestProperty("Authorization", "Bearer " + token);
        c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        send(c, new JSONObject().put("writes", new JSONArray().put(write)).toString());
        int code = c.getResponseCode();
        String body = read(c, code);
        if (code == 200) return;
        String why = errorOf(body);
        if (code == 409 || why.contains("ALREADY_EXISTS")) return;   // sent before; the answer was lost
        if (code == 401) throw new AuthException("firestore 401");
        if (code == 429 || code >= 500) throw new IOException("firestore " + code);
        throw new DeniedException("firestore " + code + " " + why);
    }

    /** A Firestore value, as the JS SDK writes it: whole numbers as integers. */
    private static JSONObject value(Object v) throws JSONException {
        if (v == null || v == JSONObject.NULL) return new JSONObject().put("nullValue", JSONObject.NULL);
        if (v instanceof Boolean) return new JSONObject().put("booleanValue", v);
        if (v instanceof Number) {
            double d = ((Number) v).doubleValue();
            if (d == Math.rint(d) && Math.abs(d) < 1e15) return new JSONObject().put("integerValue", String.valueOf((long) d));
            return new JSONObject().put("doubleValue", d);
        }
        return new JSONObject().put("stringValue", String.valueOf(v));
    }

    private static HttpURLConnection open(Context ctx, String url) throws IOException {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(10_000);
        c.setReadTimeout(15_000);
        c.setRequestMethod("POST");
        c.setDoOutput(true);
        // As the app's own requests look: its WebView page, and this app.
        c.setRequestProperty("Referer", "https://localhost/");
        c.setRequestProperty("X-Android-Package", ctx.getPackageName());
        String cert = cert(ctx);
        if (cert != null) c.setRequestProperty("X-Android-Cert", cert);
        return c;
    }

    private static void send(HttpURLConnection c, String body) throws IOException {
        try (OutputStream out = c.getOutputStream()) {
            out.write(body.getBytes(StandardCharsets.UTF_8));
        }
    }

    private static String read(HttpURLConnection c, int code) throws IOException {
        InputStream in = code >= 400 ? c.getErrorStream() : c.getInputStream();
        if (in == null) return "";
        try (InputStream s = in) {
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            for (int n; (n = s.read(buf)) > 0; ) b.write(buf, 0, n);
            return b.toString("UTF-8");
        } finally {
            c.disconnect();
        }
    }

    /** "INVALID_ARGUMENT: INVALID_REFRESH_TOKEN", "PERMISSION_DENIED: …": what the server said, never a token. */
    private static String errorOf(String body) {
        try {
            JSONObject err = new JSONObject(body).getJSONObject("error");
            String status = err.optString("status");
            String msg = err.optString("message");
            return status.isEmpty() ? msg : status + ": " + msg;
        } catch (JSONException x) {
            return "";
        }
    }

    private static String enc(String s) throws IOException {
        return URLEncoder.encode(s, "UTF-8");
    }

    /** The signing certificate's SHA-1, as Google's Android key restrictions read it. */
    @SuppressLint("PackageManagerGetSignatures")
    @SuppressWarnings("deprecation")
    private static String cert(Context ctx) {
        try {
            PackageManager pm = ctx.getPackageManager();
            Signature[] sigs;
            if (Build.VERSION.SDK_INT >= 28) {
                PackageInfo pi = pm.getPackageInfo(ctx.getPackageName(), PackageManager.GET_SIGNING_CERTIFICATES);
                sigs = pi.signingInfo == null ? null : pi.signingInfo.getApkContentsSigners();
            } else {
                sigs = pm.getPackageInfo(ctx.getPackageName(), PackageManager.GET_SIGNATURES).signatures;
            }
            if (sigs == null || sigs.length == 0) return null;
            byte[] d = MessageDigest.getInstance("SHA-1").digest(sigs[0].toByteArray());
            StringBuilder s = new StringBuilder();
            for (byte b : d) s.append(String.format(Locale.US, "%02X", b));
            return s.toString();
        } catch (Exception x) {
            return null;
        }
    }
}
