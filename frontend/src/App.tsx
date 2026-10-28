import { useCallback, useEffect, useRef, useState } from "react";
import { TopBar } from "./components/TopBar";
import { Sidebar, type ViewKey } from "./components/Sidebar";
import { ErrorState, Spinner } from "./components/primitives";
import { Accuracy } from "./views/Accuracy";
import { DeskOverview } from "./views/DeskOverview";
import { Ingestion } from "./views/Ingestion";
import { api } from "./lib/api";
import type {
  AccuracyResponse,
  DeskResponse,
  IngestionResponse,
  MetaResponse,
} from "./lib/types";

const DEFAULT_RANGE = { from: "2026-01-01", to: "2026-01-07" };

const VIEWS: ViewKey[] = ["desk", "accuracy", "ingestion"];

/** Views are addressable as #desk, #accuracy and #ingestion. */
function viewFromHash(): ViewKey {
  const key = window.location.hash.replace(/^#\/?/, "") as ViewKey;
  return VIEWS.includes(key) ? key : "desk";
}

export default function App() {
  const [view, setViewState] = useState<ViewKey>(viewFromHash);

  const setView = useCallback((next: ViewKey) => {
    setViewState(next);
    if (window.location.hash !== `#${next}`) {
      window.history.replaceState(null, "", `#${next}`);
    }
  }, []);

  useEffect(() => {
    const onHashChange = () => setViewState(viewFromHash());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);
  const [range, setRange] = useState(DEFAULT_RANGE);
  const [horizon, setHorizon] = useState(4);
  const [resolution, setResolution] = useState("30m");

  const [meta, setMeta] = useState<MetaResponse | null>(null);
  const [ingestion, setIngestion] = useState<IngestionResponse | null>(null);
  const [desk, setDesk] = useState<DeskResponse | null>(null);
  const [accuracy, setAccuracy] = useState<AccuracyResponse | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [loadingDesk, setLoadingDesk] = useState(true);
  const [loadingAccuracy, setLoadingAccuracy] = useState(false);
  const controller = useRef<AbortController | null>(null);

  const loadReference = useCallback(async () => {
    try {
      const [metaResponse, ingestionResponse] = await Promise.all([
        api.meta(),
        api.ingestion(),
      ]);
      setMeta(metaResponse);
      setIngestion(ingestionResponse);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reach the API");
    }
  }, []);

  useEffect(() => {
    void loadReference();
  }, [loadReference]);

  const loadDesk = useCallback(async () => {
    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;
    setLoadingDesk(true);
    try {
      const response = await api.desk(
        { ...range, horizon, resolution },
        next.signal,
      );
      setDesk(response);
      setError(null);
    } catch (cause) {
      if ((cause as Error).name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "Desk query failed");
    } finally {
      if (controller.current === next) setLoadingDesk(false);
    }
  }, [range, horizon, resolution]);

  useEffect(() => {
    void loadDesk();
  }, [loadDesk]);

  useEffect(() => {
    if (view !== "accuracy") return;
    const next = new AbortController();
    setLoadingAccuracy(true);
    api
      .accuracy({ ...range, horizon }, next.signal)
      .then((response) => {
        setAccuracy(response);
        setError(null);
      })
      .catch((cause) => {
        if ((cause as Error).name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Accuracy query failed");
      })
      .finally(() => setLoadingAccuracy(false));
    return () => next.abort();
  }, [view, range, horizon]);

  const retry = () => {
    void loadReference();
    void loadDesk();
  };

  return (
    <div className="flex h-screen flex-col bg-background">
      <TopBar meta={meta} horizon={horizon} />

      <div className="flex min-h-0 flex-1">
        <Sidebar view={view} onSelect={setView} meta={meta} ingestion={ingestion} />

        <main className="min-w-0 flex-1 overflow-y-auto">
          {error && <ErrorState message={error} onRetry={retry} />}

          {/* Keep the last payload on screen while the next one loads, so the
              desk does not blank out on every control change. */}
          {(loadingDesk || loadingAccuracy) && (
            <div className="h-[2px] w-full overflow-hidden bg-primary-container">
              <div className="h-full w-1/3 animate-pulse bg-primary" />
            </div>
          )}

          {view === "desk" &&
            (desk ? (
              <DeskOverview
                desk={desk}
                meta={meta}
                range={range}
                horizon={horizon}
                resolution={resolution}
                onRange={setRange}
                onHorizon={setHorizon}
                onResolution={setResolution}
                onOpenAccuracy={() => setView("accuracy")}
              />
            ) : (
              !error && <Spinner label="Loading the desk" />
            ))}

          {view === "accuracy" &&
            (accuracy ? (
              <Accuracy
                accuracy={accuracy}
                meta={meta}
                range={range}
                horizon={horizon}
                onRange={setRange}
                onHorizon={setHorizon}
              />
            ) : (
              !error && <Spinner label="Loading accuracy analytics" />
            ))}

          {view === "ingestion" &&
            (ingestion ? (
              <Ingestion
                ingestion={ingestion}
                meta={meta}
                onRefreshed={() => {
                  void loadReference();
                  void loadDesk();
                }}
              />
            ) : (
              !error && <Spinner label="Loading ingestion status" />
            ))}
        </main>
      </div>
    </div>
  );
}
