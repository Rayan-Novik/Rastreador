package com.rastreador.gps;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import org.json.JSONObject;

import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

public class LocationService extends Service implements LocationListener {

    private static final String TAG = "GPS_LocationService";
    private static final String CHANNEL_ID = "gps_tracking_channel";
    private static final int NOTIF_ID = 1001;

    public static final String ACTION_LOCATION_UPDATE = "com.rastreador.gps.LOCATION_UPDATE";
    public static final String EXTRA_LAT = "latitude";
    public static final String EXTRA_LNG = "longitude";
    public static final String EXTRA_ACCURACY = "accuracy";
    public static final String EXTRA_SPEED = "speed";
    public static final String EXTRA_BATTERY = "battery";
    public static final String EXTRA_PACKETS = "packets";

    private LocationManager locationManager;
    private PowerManager.WakeLock wakeLock;
    private OkHttpClient httpClient;
    private int sentPackets = 0;
    private int currentBattery = -1;

    private String deviceId;
    private String deviceName;
    private String serverUrl;

    @Override
    public void onCreate() {
        super.onCreate();
        httpClient = new OkHttpClient();

        // Carrega preferências
        SharedPreferences prefs = getSharedPreferences("gps_prefs", MODE_PRIVATE);
        deviceId = prefs.getString("device_id", "celular_" + (int)(Math.random() * 90000 + 10000));
        prefs.edit().putString("device_id", deviceId).apply();

        deviceName = prefs.getString("device_name", "Celular");
        serverUrl = prefs.getString("server_url", "http://169.58.140.109:6548");

        createNotificationChannel();
        startForeground(NOTIF_ID, buildNotification("Serviço de GPS ativo e transmitindo"));

        // Adquire WakeLock para não dormir a CPU
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm != null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "RastreadorGPS:WakeLock");
            wakeLock.acquire(24 * 60 * 60 * 1000L); // 24 horas
        }

        // Monitorar Bateria
        registerReceiver(batteryReceiver, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));

        // Inicia GPS
        startLocationUpdates();
    }

    private final BroadcastReceiver batteryReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            int level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
            int scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1);
            if (level >= 0 && scale > 0) {
                currentBattery = Math.round((level / (float) scale) * 100);
            }
        }
    };

    private void startLocationUpdates() {
        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        if (locationManager == null) return;

        try {
            // Provedor GPS por Satélite (com filtro de distância mínima de 10 metros para evitar teia de aranha/ruído parado)
            if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                locationManager.requestLocationUpdates(
                        LocationManager.GPS_PROVIDER,
                        4000L, // 4 segundos
                        10.0f, // Mínimo de 10 metros de deslocamento real
                        this
                );
            } else if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                // Provedor de Rede (Torres / Wi-Fi) somente se GPS estiver desligado
                locationManager.requestLocationUpdates(
                        LocationManager.NETWORK_PROVIDER,
                        5000L,
                        15.0f,
                        this
                );
            }
        } catch (SecurityException e) {
            Log.e(TAG, "Permissão de localização não concedida: " + e.getMessage());
        }
    }

    @Override
    public void onLocationChanged(Location location) {
        if (location == null) return;

        double lat = location.getLatitude();
        double lng = location.getLongitude();
        float accuracy = location.getAccuracy();
        float speed = location.getSpeed();
        double altitude = location.getAltitude();
        float heading = location.getBearing();

        // Envia para a VPS
        sendToServer(lat, lng, accuracy, speed, altitude, heading);

        // Notifica MainActivity se estiver aberta
        Intent intent = new Intent(ACTION_LOCATION_UPDATE);
        intent.putExtra(EXTRA_LAT, lat);
        intent.putExtra(EXTRA_LNG, lng);
        intent.putExtra(EXTRA_ACCURACY, accuracy);
        intent.putExtra(EXTRA_SPEED, speed);
        intent.putExtra(EXTRA_BATTERY, currentBattery);
        intent.putExtra(EXTRA_PACKETS, sentPackets);
        sendBroadcast(intent);
    }

    private void sendToServer(double lat, double lng, float accuracy, float speed, double altitude, float heading) {
        try {
            SimpleDateFormat sdf = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
            sdf.setTimeZone(TimeZone.getTimeZone("UTC"));
            String timestamp = sdf.format(new Date());

            JSONObject json = new JSONObject();
            json.put("deviceId", deviceId);
            json.put("name", deviceName);
            json.put("latitude", lat);
            json.put("longitude", lng);
            json.put("accuracy", accuracy);
            json.put("speed", speed);
            json.put("altitude", altitude);
            json.put("heading", heading);
            json.put("battery", currentBattery >= 0 ? currentBattery : null);
            json.put("timestamp", timestamp);

            String url = serverUrl;
            if (!url.endsWith("/")) url += "/";
            url += "api/location";

            RequestBody body = RequestBody.create(
                    json.toString(),
                    MediaType.parse("application/json; charset=utf-8")
            );

            Request request = new Request.Builder()
                    .url(url)
                    .post(body)
                    .build();

            httpClient.newCall(request).enqueue(new Callback() {
                @Override
                public void onFailure(Call call, IOException e) {
                    Log.w(TAG, "Falha ao enviar localização para VPS: " + e.getMessage());
                }

                @Override
                public void onResponse(Call call, Response response) throws IOException {
                    if (response.isSuccessful()) {
                        sentPackets++;
                    }
                    response.close();
                }
            });

        } catch (Exception e) {
            Log.e(TAG, "Erro ao serializar dados: " + e.getMessage());
        }
    }

    private Notification buildNotification(String text) {
        Intent notificationIntent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this, 0, notificationIntent,
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0
        );

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Rastreamento GPS Ativo 24/7")
                .setContentText(text)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .build();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Rastreamento GPS em Segundo Plano",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Mantém a transmissão contínua de coordenadas");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (locationManager != null) {
            locationManager.removeUpdates(this);
        }
        if (batteryReceiver != null) {
            try { unregisterReceiver(batteryReceiver); } catch (Exception ignored) {}
        }
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        stopForeground(true);
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onProviderEnabled(String provider) {}
    @Override
    public void onProviderDisabled(String provider) {}
    @Override
    public void onStatusChanged(String provider, int status, Bundle extras) {}
}
