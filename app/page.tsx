'use client';

import { useEffect, useState, useRef } from 'react';
import mqtt from 'mqtt';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';

interface SensorData {
  temperature: number | null;
  humidity: number | null;
  light_status: string;
  light_value: number;
  timestamp: string;
  time: string;
}

interface Stats {
  temp: { min: string; max: string; avg: string };
  humidity: { min: string; max: string; avg: string };
}

const PI_IP = process.env.NEXT_PUBLIC_PI_IP || 'raspberrypi.local';

export default function Dashboard() {
  const [data, setData] = useState<SensorData>({
    temperature: null,
    humidity: null,
    light_status: 'unknown',
    light_value: 0,
    timestamp: '-',
    time: '-'
  });
  const [chartData, setChartData] = useState<SensorData[]>([]);
  const [stats, setStats] = useState<Stats>({
    temp: { min: '--', max: '--', avg: '--' },
    humidity: { min: '--', max: '--', avg: '--' }
  });
  const [status, setStatus] = useState<'connecting' | 'online' | 'offline'>('connecting');
  const [messageCount, setMessageCount] = useState(0);
  const clientRef = useRef<mqtt.MqttClient | null>(null);

  // Calculate stats from chart data
  const calculateStats = (data: SensorData[]) => {
    const temps = data.filter(r => r.temperature !== null).map(r => r.temperature as number);
    const humids = data.filter(r => r.humidity !== null).map(r => r.humidity as number);

    return {
      temp: {
        min: temps.length ? Math.min(...temps).toFixed(1) : '--',
        max: temps.length ? Math.max(...temps).toFixed(1) : '--',
        avg: temps.length ? (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1) : '--'
      },
      humidity: {
        min: humids.length ? Math.min(...humids).toFixed(1) : '--',
        max: humids.length ? Math.max(...humids).toFixed(1) : '--',
        avg: humids.length ? (humids.reduce((a, b) => a + b, 0) / humids.length).toFixed(1) : '--'
      }
    };
  };

  // Fetch historical data on load
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch('/api/sensors');
        const json = await res.json();
        if (json.chartData) {
          setChartData(json.chartData);
          setStats(calculateStats(json.chartData));
        }
        if (json.current) {
          setData(json.current);
        }
      } catch (err) {
        console.error('Failed to fetch history:', err);
      }
    };
    fetchHistory();
  }, []);

  // Connect to MQTT WebSocket
  useEffect(() => {
    const client = mqtt.connect(`ws://${PI_IP}:9001`);
    clientRef.current = client;

    client.on('connect', () => {
      console.log('Connected to MQTT broker');
      setStatus('online');
      client.subscribe('sensors/data');
    });

    client.on('message', (topic, message) => {
      try {
        const payload = JSON.parse(message.toString());
        
        const newData: SensorData = {
          temperature: payload.temperature,
          humidity: payload.humidity,
          light_status: payload.light_status || (payload.light_value === 0 ? 'dark' : 'bright'),
          light_value: payload.light_value,
          timestamp: payload.timestamp || new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
          time: new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit' })
        };

        setData(newData);
        setMessageCount(prev => prev + 1);

        // Add to chart data (keep last 100 points)
        setChartData(prev => {
          const updated = [...prev, newData].slice(-100);
          setStats(calculateStats(updated));
          return updated;
        });

      } catch (err) {
        console.error('Failed to parse message:', err);
      }
    });

    client.on('error', (err) => {
      console.error('MQTT error:', err);
      setStatus('offline');
    });

    client.on('close', () => {
      setStatus('offline');
    });

    return () => {
      client.end();
    };
  }, []);

  return (
    <main className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">🏭 IoT Monitoring System</h1>
            <p className="text-gray-400 text-sm mt-1">Real-time Industrial Environmental Monitoring</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-xs text-gray-500">
              Messages: <span className="text-white font-mono">{messageCount}</span>
            </div>
            <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm ${
              status === 'online' ? 'bg-green-500/20 text-green-400' :
              status === 'offline' ? 'bg-red-500/20 text-red-400' :
              'bg-yellow-500/20 text-yellow-400'
            }`}>
              <div className={`w-2 h-2 rounded-full ${
                status === 'online' ? 'bg-green-400 animate-pulse' :
                status === 'offline' ? 'bg-red-400' :
                'bg-yellow-400 animate-pulse'
              }`} />
              {status === 'online' ? 'Live (WebSocket)' : status === 'offline' ? 'Disconnected' : 'Connecting...'}
            </div>
          </div>
        </div>

        {/* Current Readings Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* Temperature */}
          <div className="bg-gradient-to-br from-orange-500 to-red-600 rounded-xl p-5 shadow-lg transition-all duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-orange-100 text-xs font-medium uppercase tracking-wide">Temperature</p>
                <p className="text-4xl font-bold mt-1 transition-all duration-300">
                  {data.temperature !== null ? `${data.temperature.toFixed(1)}°C` : '--'}
                </p>
              </div>
              <div className="text-5xl opacity-30">🌡️</div>
            </div>
            <div className="mt-3 flex gap-4 text-xs text-orange-100">
              <span>Min: {stats.temp.min}°</span>
              <span>Max: {stats.temp.max}°</span>
              <span>Avg: {stats.temp.avg}°</span>
            </div>
          </div>

          {/* Humidity */}
          <div className="bg-gradient-to-br from-blue-500 to-cyan-600 rounded-xl p-5 shadow-lg transition-all duration-300">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-blue-100 text-xs font-medium uppercase tracking-wide">Humidity</p>
                <p className="text-4xl font-bold mt-1 transition-all duration-300">
                  {data.humidity !== null ? `${data.humidity.toFixed(1)}%` : '--'}
                </p>
              </div>
              <div className="text-5xl opacity-30">💧</div>
            </div>
            <div className="mt-3 flex gap-4 text-xs text-blue-100">
              <span>Min: {stats.humidity.min}%</span>
              <span>Max: {stats.humidity.max}%</span>
              <span>Avg: {stats.humidity.avg}%</span>
            </div>
          </div>

          {/* Light */}
          <div className={`bg-gradient-to-br transition-all duration-500 ${
            data.light_status === 'bright'
              ? 'from-yellow-400 to-orange-500'
              : 'from-gray-600 to-gray-800'
          } rounded-xl p-5 shadow-lg`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide opacity-80">Light Level</p>
                <p className="text-4xl font-bold mt-1 capitalize">{data.light_status}</p>
              </div>
              <div className="text-5xl opacity-30 transition-all duration-500">
                {data.light_status === 'bright' ? '☀️' : '🌙'}
              </div>
            </div>
            <div className="mt-3 text-xs opacity-80">
              {data.time}
            </div>
          </div>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* Temperature Chart */}
          <div className="bg-gray-800 rounded-xl p-5">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="text-orange-400">🌡️</span> Temperature Trend
            </h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="tempGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="time" stroke="#9ca3af" fontSize={10} tickLine={false} />
                  <YAxis stroke="#9ca3af" fontSize={10} tickLine={false} domain={['dataMin - 2', 'dataMax + 2']} unit="°C" />
                  <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }} />
                  <Area type="monotone" dataKey="temperature" stroke="#f97316" strokeWidth={2} fill="url(#tempGradient)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Humidity Chart */}
          <div className="bg-gray-800 rounded-xl p-5">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="text-blue-400">💧</span> Humidity Trend
            </h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="humidGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="time" stroke="#9ca3af" fontSize={10} tickLine={false} />
                  <YAxis stroke="#9ca3af" fontSize={10} tickLine={false} domain={['dataMin - 5', 'dataMax + 5']} unit="%" />
                  <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }} />
                  <Area type="monotone" dataKey="humidity" stroke="#06b6d4" strokeWidth={2} fill="url(#humidGradient)" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Combined Chart */}
        <div className="bg-gray-800 rounded-xl p-5 mb-6">
          <h2 className="text-lg font-semibold mb-4">📊 Live Sensor Feed</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="time" stroke="#9ca3af" fontSize={10} tickLine={false} />
                <YAxis yAxisId="temp" stroke="#f97316" fontSize={10} tickLine={false} orientation="left" domain={['dataMin - 2', 'dataMax + 2']} />
                <YAxis yAxisId="humid" stroke="#06b6d4" fontSize={10} tickLine={false} orientation="right" domain={['dataMin - 5', 'dataMax + 5']} />
                <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }} />
                <Line yAxisId="temp" type="monotone" dataKey="temperature" stroke="#f97316" strokeWidth={2} dot={false} name="Temp (°C)" isAnimationActive={false} />
                <Line yAxisId="humid" type="monotone" dataKey="humidity" stroke="#06b6d4" strokeWidth={2} dot={false} name="Humidity (%)" isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recent Data Table */}
        <div className="bg-gray-800 rounded-xl p-5">
          <h2 className="text-lg font-semibold mb-4">📋 Last 10 Readings</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="pb-3 text-gray-400 font-medium">Time</th>
                  <th className="pb-3 text-gray-400 font-medium">Temp (°C)</th>
                  <th className="pb-3 text-gray-400 font-medium">Humidity (%)</th>
                  <th className="pb-3 text-gray-400 font-medium">Light</th>
                </tr>
              </thead>
              <tbody>
                {chartData.slice(-10).reverse().map((row, i) => (
                  <tr key={i} className={`border-b border-gray-700/50 ${i === 0 ? 'bg-gray-700/30' : ''}`}>
                    <td className="py-2 font-mono text-xs">{row.time}</td>
                    <td className="py-2">{row.temperature?.toFixed(1) || '--'}</td>
                    <td className="py-2">{row.humidity?.toFixed(1) || '--'}</td>
                    <td className="py-2 capitalize">{row.light_status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-gray-500 text-xs">
          <p>Industrial IoT Monitoring • MQTT WebSocket • InfluxDB • Raspberry Pi 4 • Next.js</p>
        </div>
      </div>
    </main>
  );
}