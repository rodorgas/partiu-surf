import { Desktop } from "@/components/Desktop";
import { Mobile } from "@/components/Mobile";
import { MOCK_FORECAST } from "@/lib/data";

export default function Page() {
  // Phase 3 will swap MOCK_FORECAST for a getForecast() call against Open-Meteo + WorldTides.
  const data = MOCK_FORECAST;
  return (
    <>
      <div className="layout-desktop">
        <Desktop data={data} />
      </div>
      <div className="layout-mobile">
        <Mobile data={data} />
      </div>
    </>
  );
}
