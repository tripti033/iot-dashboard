import { NextResponse } from 'next/server';
import { InfluxDB } from '@influxdata/influxdb-client';

const INFLUX_URL = process.env.INFLUX_URL!;
const INFLUX_TOKEN = process.env.INFLUX_TOKEN!;
const INFLUX_ORG = process.env.INFLUX_ORG!;
const INFLUX_BUCKET = process.env.INFLUX_BUCKET!;

export async function GET() {
  try {
    const client = new InfluxDB({ url: INFLUX_URL, token: INFLUX_TOKEN });
    const queryApi = client.getQueryApi(INFLUX_ORG);

    const query = `
      from(bucket: "${INFLUX_BUCKET}")
        |> range(start: -6h)
        |> filter(fn: (r) => r._measurement == "environment")
        |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
        |> sort(columns: ["_time"], desc: true)
        |> limit(n: 500)
    `;

    const results: any[] = [];

    await new Promise<void>((resolve, reject) => {
      queryApi.queryRows(query, {
        next(row, tableMeta) {
          const data = tableMeta.toObject(row);
          results.push({
            timestamp: new Date(data._time).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
            time: new Date(data._time).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }),
            temperature: data.temperature,
            humidity: data.humidity,
            light_status: data.light_status || 'unknown',
            light_value: data.light_value
          });
        },
        error(err) {
          reject(err);
        },
        complete() {
          resolve();
        }
      });
    });

    // Reverse for chronological order in charts
    const chartData = [...results].reverse();

    // Calculate stats
    const temps = results.filter(r => r.temperature).map(r => r.temperature);
    const humids = results.filter(r => r.humidity).map(r => r.humidity);
    
    const stats = {
      temp: {
        min: temps.length ? Math.min(...temps).toFixed(1) : null,
        max: temps.length ? Math.max(...temps).toFixed(1) : null,
        avg: temps.length ? (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1) : null
      },
      humidity: {
        min: humids.length ? Math.min(...humids).toFixed(1) : null,
        max: humids.length ? Math.max(...humids).toFixed(1) : null,
        avg: humids.length ? (humids.reduce((a, b) => a + b, 0) / humids.length).toFixed(1) : null
      }
    };

    return NextResponse.json({
      current: results[0] || { temperature: null, humidity: null, light_status: 'unknown', timestamp: '-' },
      history: results.slice(0, 20),
      chartData: chartData,
      stats: stats
    });

  } catch (error) {
    console.error('InfluxDB error:', error);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}