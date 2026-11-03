import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';
import { TelemetryOut } from '../../types/api';
import { Thermometer, Droplets } from 'lucide-react';

interface TelemetryChartProps {
  telemetry: TelemetryOut[];
  tempMinC: number;
  tempMaxC: number;
}

export const TelemetryChart: React.FC<TelemetryChartProps> = ({
  telemetry,
  tempMinC,
  tempMaxC,
}) => {
  if (telemetry.length === 0) {
    return (
      <div
        style={{
          height: '280px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--color-text-tertiary)',
          fontSize: 'var(--text-sm)',
          backgroundColor: 'var(--color-surface-secondary)',
          borderRadius: 'var(--radius-lg)',
          border: '1px dashed var(--color-border)',
        }}
      >
        <Thermometer size={32} style={{ marginBottom: '8px', opacity: 0.5 }} />
        <span>Chưa có dữ liệu mẫu telemetry để vẽ biểu đồ</span>
      </div>
    );
  }

  // Format data points for Recharts
  const chartData = telemetry.map((sample, idx) => {
    const timeStr = new Date(sample.received_at).toLocaleTimeString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    return {
      index: idx + 1,
      time: timeStr,
      fullTime: new Date(sample.received_at).toLocaleString('vi-VN'),
      temperature: Number(sample.temperature_c.toFixed(2)),
      humidity: Number(sample.humidity_pct.toFixed(1)),
      isBreached: sample.temperature_c < tempMinC || sample.temperature_c > tempMaxC,
    };
  });

  // Calculate dynamic Y-axis domain
  const temps = telemetry.map((t) => t.temperature_c);
  const minTemp = Math.min(tempMinC - 2, ...temps);
  const maxTemp = Math.max(tempMaxC + 2, ...temps);

  return (
    <div style={{ width: '100%', height: '320px' }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 15, right: 30, left: 0, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" />
          
          <XAxis
            dataKey="time"
            tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
            stroke="var(--color-border)"
          />
          
          {/* Left Y-axis: Temperature */}
          <YAxis
            yAxisId="temp"
            domain={[Math.floor(minTemp), Math.ceil(maxTemp)]}
            tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
            unit="°C"
            stroke="var(--color-border)"
          />

          {/* Right Y-axis: Humidity */}
          <YAxis
            yAxisId="humidity"
            orientation="right"
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: 'var(--color-text-secondary)' }}
            unit="%"
            stroke="var(--color-border)"
          />

          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload;
                return (
                  <div
                    style={{
                      backgroundColor: 'var(--color-surface)',
                      padding: '10px 14px',
                      borderRadius: 'var(--radius-md)',
                      boxShadow: 'var(--shadow-popover)',
                      border: '1px solid var(--color-border)',
                      fontSize: '12px',
                    }}
                  >
                    <div style={{ fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: '4px' }}>
                      {data.fullTime}
                    </div>
                    <div style={{ color: data.isBreached ? 'var(--color-danger)' : 'var(--color-text-primary)', fontWeight: 600 }}>
                      Nhiệt độ: {data.temperature}°C {data.isBreached && '⚠️ (Vượt ngưỡng!)'}
                    </div>
                    <div style={{ color: '#007AFF', marginTop: '2px' }}>
                      Độ ẩm: {data.humidity}%
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '4px' }}>
                      Khoảng an toàn: {tempMinC}°C – {tempMaxC}°C
                    </div>
                  </div>
                );
              }
              return null;
            }}
          />

          <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />

          {/* Safe temperature range threshold lines */}
          <ReferenceLine
            yAxisId="temp"
            y={tempMaxC}
            stroke="#D70015"
            strokeDasharray="4 4"
            label={{ value: `Max: ${tempMaxC}°C`, fill: '#D70015', fontSize: 11, position: 'insideTopRight' }}
          />
          <ReferenceLine
            yAxisId="temp"
            y={tempMinC}
            stroke="#B76E00"
            strokeDasharray="4 4"
            label={{ value: `Min: ${tempMinC}°C`, fill: '#B76E00', fontSize: 11, position: 'insideBottomRight' }}
          />

          {/* Temperature Series */}
          <Line
            yAxisId="temp"
            type="monotone"
            dataKey="temperature"
            name="Nhiệt độ (°C)"
            stroke="#D70015"
            strokeWidth={2.5}
            dot={(props) => {
              const { cx, cy, payload } = props;
              const isBreached = payload.isBreached;
              return (
                <circle
                  key={`dot-${props.index}`}
                  cx={cx}
                  cy={cy}
                  r={isBreached ? 5 : 3.5}
                  fill={isBreached ? '#D70015' : '#FFFFFF'}
                  stroke="#D70015"
                  strokeWidth={2}
                />
              );
            }}
            activeDot={{ r: 6 }}
          />

          {/* Humidity Series */}
          <Line
            yAxisId="humidity"
            type="monotone"
            dataKey="humidity"
            name="Độ ẩm (%)"
            stroke="#007AFF"
            strokeWidth={1.8}
            dot={{ r: 2.5, fill: '#007AFF' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

