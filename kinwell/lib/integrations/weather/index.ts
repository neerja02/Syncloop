import "server-only";
import { env } from "@/lib/config/env";

export interface WeatherSnapshot {
  temperatureC: number;
  feelsLikeC: number | null;
  humidity: number;
  uvIndex: number;
  aqi: number | null;
  pollen: "low" | "moderate" | "high" | null;
  condition: string;
  warnings: string[];
  locationLabel: string;
  source: string;
  isMock: boolean;
  observedAt: string;
}

export interface WeatherProvider {
  readonly name: string;
  current(lat: number, lon: number, label?: string): Promise<WeatherSnapshot>;
}

export class MockWeatherProvider implements WeatherProvider {
  readonly name = "mock";
  async current(_lat: number, _lon: number, label = "Demo location"): Promise<WeatherSnapshot> {
    return {
      temperatureC: 34,
      feelsLikeC: 39,
      humidity: 62,
      uvIndex: 9,
      aqi: 142,
      pollen: "moderate",
      condition: "Hot and humid",
      warnings: ["Heat advisory (demo)"],
      locationLabel: label,
      source: "Mock weather (development)",
      isMock: true,
      observedAt: new Date().toISOString(),
    };
  }
}

/** Open-Meteo (free, no key): forecast + air-quality APIs. */
export class OpenMeteoWeatherProvider implements WeatherProvider {
  readonly name = "open-meteo";
  async current(lat: number, lon: number, label = "Your location"): Promise<WeatherSnapshot> {
    const [wx, aq] = await Promise.all([
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,uv_index,weather_code`, { signal: AbortSignal.timeout(5000), next: { revalidate: 900 } }).then((r) => r.json()),
      fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=us_aqi,grass_pollen`, { signal: AbortSignal.timeout(5000), next: { revalidate: 900 } })
        .then((r) => r.json())
        .catch(() => null),
    ]);
    const c = wx.current ?? {};
    const pollenVal = aq?.current?.grass_pollen as number | undefined;
    const warnings: string[] = [];
    if (c.temperature_2m >= 38) warnings.push("Extreme heat");
    if (c.temperature_2m <= 0) warnings.push("Freezing temperatures");
    return {
      temperatureC: Math.round(c.temperature_2m),
      feelsLikeC: c.apparent_temperature != null ? Math.round(c.apparent_temperature) : null,
      humidity: c.relative_humidity_2m,
      uvIndex: c.uv_index ?? 0,
      aqi: aq?.current?.us_aqi ?? null,
      pollen: pollenVal == null ? null : pollenVal > 50 ? "high" : pollenVal > 10 ? "moderate" : "low",
      condition: weatherCodeLabel(c.weather_code),
      warnings,
      locationLabel: label,
      source: "Open-Meteo",
      isMock: false,
      observedAt: new Date().toISOString(),
    };
  }
}

function weatherCodeLabel(code: number) {
  if (code === 0) return "Clear";
  if (code <= 3) return "Partly cloudy";
  if (code <= 48) return "Fog";
  if (code <= 67) return "Rain";
  if (code <= 77) return "Snow";
  if (code <= 82) return "Showers";
  return "Thunderstorm";
}

export function getWeatherProvider(): WeatherProvider {
  return env.weatherProvider === "open-meteo" ? new OpenMeteoWeatherProvider() : new MockWeatherProvider();
}

/** Converts weather into calm, practical health tips. Never alarming. */
export function weatherHealthTips(w: WeatherSnapshot, ctx: { hasRespiratoryCondition?: boolean; hasHeartCondition?: boolean } = {}) {
  const tips: { title: string; body: string }[] = [];
  if (w.temperatureC >= 32) tips.push({ title: "Hot day", body: "Drink water regularly, prefer shade, and move outdoor exercise to early morning or evening." });
  if (w.temperatureC <= 5) tips.push({ title: "Cold weather", body: "Dress in layers and keep hands and feet warm. Cold air can make breathing feel harder for some people." });
  if (w.uvIndex >= 6) tips.push({ title: `UV index ${w.uvIndex}`, body: "Use sunscreen, a hat and sunglasses if you're outside between late morning and mid-afternoon." });
  if (w.aqi != null && w.aqi > 100)
    tips.push({
      title: `Air quality index ${w.aqi}`,
      body: ctx.hasRespiratoryCondition ? "Air quality is poor. Consider indoor exercise today and keep any reliever inhaler your doctor prescribed with you." : "Air quality is poor. Consider shorter or indoor workouts today.",
    });
  if (w.pollen === "high") tips.push({ title: "High pollen", body: "If you have hay fever, keep windows closed during the day and shower after being outdoors." });
  if (w.humidity >= 75 && w.temperatureC >= 28) tips.push({ title: "Humid", body: "Sweat evaporates slowly in humid heat, so take breaks and watch for dizziness during activity." });
  return tips;
}
