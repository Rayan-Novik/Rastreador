package com.rastreador.gps;

import android.Manifest;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.google.android.material.button.MaterialButton;
import com.google.android.material.switchmaterial.SwitchMaterial;
import com.google.android.material.textfield.TextInputEditText;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends AppCompatActivity {

    private static final int PERMISSION_REQ_CODE = 2001;
    private static final int BG_PERMISSION_REQ_CODE = 2002;

    private TextView tvStatusBadge;
    private TextInputEditText etDeviceName;
    private TextInputEditText etServerUrl;
    private SwitchMaterial switchBackground;
    private MaterialButton btnToggleTracking;

    private TextView tvCoords;
    private TextView tvAccuracy;
    private TextView tvSpeed;
    private TextView tvBattery;
    private TextView tvPackets;

    private boolean isRunning = false;
    private SharedPreferences prefs;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        prefs = getSharedPreferences("gps_prefs", MODE_PRIVATE);

        // Bindings
        tvStatusBadge = findViewById(R.id.tvStatusBadge);
        etDeviceName = findViewById(R.id.etDeviceName);
        etServerUrl = findViewById(R.id.etServerUrl);
        switchBackground = findViewById(R.id.switchBackground);
        btnToggleTracking = findViewById(R.id.btnToggleTracking);

        tvCoords = findViewById(R.id.tvCoords);
        tvAccuracy = findViewById(R.id.tvAccuracy);
        tvSpeed = findViewById(R.id.tvSpeed);
        tvBattery = findViewById(R.id.tvBattery);
        tvPackets = findViewById(R.id.tvPackets);

        // Carrega valores salvos
        etDeviceName.setText(prefs.getString("device_name", "Celular"));
        etServerUrl.setText(prefs.getString("server_url", "http://169.58.140.109:6548"));
        switchBackground.setChecked(prefs.getBoolean("bg_enabled", true));
        isRunning = prefs.getBoolean("service_running", false);

        updateUIState(isRunning);

        btnToggleTracking.setOnClickListener(v -> {
            if (isRunning) {
                stopTrackingService();
            } else {
                checkAndRequestPermissions();
            }
        });
    }

    private void updateUIState(boolean running) {
        isRunning = running;
        prefs.edit().putBoolean("service_running", running).apply();

        if (running) {
            tvStatusBadge.setText("● ATIVO E TRANSMITINDO 24/7");
            tvStatusBadge.setTextColor(Color.parseColor("#22C55E"));
            tvStatusBadge.setBackgroundColor(Color.parseColor("#2622C55E"));

            btnToggleTracking.setText("PARAR RASTREAMENTO");
            btnToggleTracking.setBackgroundColor(Color.parseColor("#F43F5E"));
        } else {
            tvStatusBadge.setText("● PARADO");
            tvStatusBadge.setTextColor(Color.parseColor("#F43F5E"));
            tvStatusBadge.setBackgroundColor(Color.parseColor("#26F43F5E"));

            btnToggleTracking.setText("INICIAR RASTREAMENTO");
            btnToggleTracking.setBackgroundColor(Color.parseColor("#22C55E"));
        }
    }

    private void checkAndRequestPermissions() {
        List<String> neededPermissions = new ArrayList<>();

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            neededPermissions.add(Manifest.permission.ACCESS_FINE_LOCATION);
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            neededPermissions.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                neededPermissions.add(Manifest.permission.POST_NOTIFICATIONS);
            }
        }

        if (!neededPermissions.isEmpty()) {
            ActivityCompat.requestPermissions(this, neededPermissions.toArray(new String[0]), PERMISSION_REQ_CODE);
        } else {
            checkBackgroundLocationPermission();
        }
    }

    private void checkBackgroundLocationPermission() {
        if (switchBackground.isChecked() && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_BACKGROUND_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                new AlertDialog.Builder(this)
                        .setTitle("Permissão de Segundo Plano 24/7")
                        .setMessage("Para permitir o acompanhamento da localização do celular mesmo quando o aplicativo estiver fechado ou com a tela apagada, selecione a opção:\n\n👉 'Permitir o tempo todo' (Allow all the time)")
                        .setPositiveButton("Continuar", (dialog, which) -> {
                            ActivityCompat.requestPermissions(
                                    this,
                                    new String[]{Manifest.permission.ACCESS_BACKGROUND_LOCATION},
                                    BG_PERMISSION_REQ_CODE
                            );
                        })
                        .setNegativeButton("Agora não", (dialog, which) -> startTrackingService())
                        .show();
                return;
            }
        }

        requestIgnoreBatteryOptimizations();
        startTrackingService();
    }

    private void requestIgnoreBatteryOptimizations() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null && !pm.isIgnoringBatteryOptimizations(getPackageName())) {
                try {
                    Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                    intent.setData(Uri.parse("package:" + getPackageName()));
                    startActivity(intent);
                } catch (Exception ignored) {}
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        if (requestCode == PERMISSION_REQ_CODE) {
            boolean allGranted = true;
            for (int res : grantResults) {
                if (res != PackageManager.PERMISSION_GRANTED) {
                    allGranted = false;
                    break;
                }
            }

            if (allGranted) {
                checkBackgroundLocationPermission();
            } else {
                Toast.makeText(this, "Permissão de localização é necessária para o rastreador.", Toast.LENGTH_LONG).show();
            }
        } else if (requestCode == BG_PERMISSION_REQ_CODE) {
            requestIgnoreBatteryOptimizations();
            startTrackingService();
        }
    }

    private void startTrackingService() {
        // Salva configs
        String name = etDeviceName.getText() != null ? etDeviceName.getText().toString().trim() : "Celular";
        String server = etServerUrl.getText() != null ? etServerUrl.getText().toString().trim() : "http://169.58.140.109:6548";

        prefs.edit()
                .putString("device_name", name)
                .putString("server_url", server)
                .putBoolean("bg_enabled", switchBackground.isChecked())
                .apply();

        Intent serviceIntent = new Intent(this, LocationService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ContextCompat.startForegroundService(this, serviceIntent);
        } else {
            startService(serviceIntent);
        }

        updateUIState(true);
        Toast.makeText(this, "Rastreamento GPS iniciado!", Toast.LENGTH_SHORT).show();
    }

    private void stopTrackingService() {
        Intent serviceIntent = new Intent(this, LocationService.class);
        stopService(serviceIntent);
        updateUIState(false);
        Toast.makeText(this, "Rastreamento parado.", Toast.LENGTH_SHORT).show();
    }

    private final BroadcastReceiver locationUpdateReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            double lat = intent.getDoubleExtra(LocationService.EXTRA_LAT, 0);
            double lng = intent.getDoubleExtra(LocationService.EXTRA_LNG, 0);
            float accuracy = intent.getFloatExtra(LocationService.EXTRA_ACCURACY, 0);
            float speed = intent.getFloatExtra(LocationService.EXTRA_SPEED, 0);
            int battery = intent.getIntExtra(LocationService.EXTRA_BATTERY, -1);
            int packets = intent.getIntExtra(LocationService.EXTRA_PACKETS, 0);

            tvCoords.setText(String.format("Coordenadas: %.6f, %.6f", lat, lng));
            tvAccuracy.setText(String.format("Precisão: ± %.1f m", accuracy));
            tvSpeed.setText(String.format("Velocidade: %.0f km/h", speed * 3.6f));
            if (battery >= 0) {
                tvBattery.setText(String.format("Bateria: %d %%", battery));
            }
            tvPackets.setText(String.format("Enviados: %d", packets));
        }
    };

    @Override
    protected void onResume() {
        super.onResume();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(locationUpdateReceiver, new IntentFilter(LocationService.ACTION_LOCATION_UPDATE), Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(locationUpdateReceiver, new IntentFilter(LocationService.ACTION_LOCATION_UPDATE));
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        try {
            unregisterReceiver(locationUpdateReceiver);
        } catch (Exception ignored) {}
    }
}
