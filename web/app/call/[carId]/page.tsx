"use client";

import type { RTMClient } from "agora-rtm";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { getConfig, startAgent, stopAgent, getInventory, Car } from "@/services/api";
import type { AgoraRenewalTokens, AgoraTokenData } from "@/types/conversation";

const CARLOCallComponent = dynamic(
	() => import("@/components/CARLOCallComponent"),
	{ ssr: false }
);

function waitForRtmConnected(rtmClient: RTMClient, timeoutMs = 600): Promise<void> {
	return new Promise((resolve) => {
		let settled = false;
		let timer: ReturnType<typeof setTimeout> | null = null;

		const finish = () => {
			if (settled) return;
			settled = true;
			if (timer) clearTimeout(timer);
			rtmClient.removeEventListener("status", onStatus);
			resolve();
		};

		const onStatus = (
			connectionStatus:
				| { newState?: string }
				| { state?: string }
				| Record<string, unknown>,
		) => {
			const nextState =
				typeof connectionStatus === "object" && connectionStatus !== null
					? "newState" in connectionStatus
						? connectionStatus.newState
						: "state" in connectionStatus
							? connectionStatus.state
							: undefined
					: undefined;
			if (nextState === "CONNECTED") {
				finish();
			}
		};

		rtmClient.addEventListener("status", onStatus);
		timer = setTimeout(finish, timeoutMs);
	});
}

const AgoraProvider = dynamic(
	async () => {
		const { AgoraRTCProvider, default: AgoraRTC } = await import(
			"agora-rtc-react"
		);

		return {
			default: function AgoraProviders({
				children,
			}: { children: React.ReactNode }) {
				const clientRef = useRef<ReturnType<
					typeof AgoraRTC.createClient
				> | null>(null);
				if (!clientRef.current) {
					clientRef.current = AgoraRTC.createClient({
						mode: "rtc",
						codec: "vp8",
					});
				}
				return (
					<AgoraRTCProvider client={clientRef.current}>
						{children}
					</AgoraRTCProvider>
				);
			},
		};
	},
	{ ssr: false },
);

export default function CallCarPage() {
  const params = useParams();
  const router = useRouter();
  const carId = params.carId as string;

  const [car, setCar] = useState<Car | null>(null);
  const [carLoading, setCarLoading] = useState(true);
  const [carError, setCarError] = useState<string | null>(null);

	const [showConversation, setShowConversation] = useState(false);
	const [agoraData, setAgoraData] = useState<AgoraTokenData | null>(null);
	const [rtmClient, setRtmClient] = useState<RTMClient | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [agentJoinError, setAgentJoinError] = useState(false);

  // Fetch Car specifications
  useEffect(() => {
    async function loadCar() {
      try {
        const inventory = await getInventory();
        const foundCar = inventory.find(c => c.id === Number(carId));
        if (foundCar) {
          setCar(foundCar);
        } else {
          setCarError("Car not found in our dealership inventory.");
        }
      } catch (err) {
        console.error("Failed to load car details:", err);
        setCarError("Could not retrieve car details. Please check connection.");
      } finally {
        setCarLoading(false);
      }
    }
    loadCar();
  }, [carId]);

	useEffect(() => {
		import("agora-rtc-react").catch(() => {});
		import("agora-rtm").catch(() => {});
	}, []);

	const handleStartConversation = async () => {
		setIsLoading(true);
		setError(null);
		setAgentJoinError(false);

		try {
			const config = await getConfig();
			const appId = config.app_id;

			const [agentIdResult, rtm] = await Promise.all([
				startAgent(
					config.channel_name,
					Number(config.agent_uid),
					Number(config.uid),
          Number(carId)
				).catch((err) => {
					console.error("Failed to start conversation with agent:", err);
					setAgentJoinError(true);
					return undefined;
				}),
				(async () => {
					const { default: AgoraRTM } = await import("agora-rtm");
					const nextRtm: RTMClient = new AgoraRTM.RTM(appId, config.uid);
					await nextRtm.login({ token: config.token });
					await waitForRtmConnected(nextRtm);
					await nextRtm.subscribe(config.channel_name);
					return nextRtm;
				})(),
			]);

			setRtmClient(rtm);
			setAgoraData({
				token: config.token,
				uid: config.uid,
				channel: config.channel_name,
				appId: config.app_id,
				agentUid: config.agent_uid,
				agentId: agentIdResult,
			});
			setShowConversation(true);
		} catch (nextError) {
			setError("Failed to initialize Agora voice channel. Please try again.");
			console.error("Error starting conversation:", nextError);
		} finally {
			setIsLoading(false);
		}
	};

	const handleTokenWillExpire = useCallback(
		async (uid: string): Promise<AgoraRenewalTokens> => {
			try {
				const channel = agoraData?.channel;
				if (!channel) {
					throw new Error("Missing channel for token renewal");
				}

				const [rtcConfig, rtmConfig] = await Promise.all([
					getConfig({ channel, uid }),
					getConfig({ channel, uid: agoraData.uid }),
				]);

				return {
					rtcToken: rtcConfig.token,
					rtmToken: rtmConfig.token,
				};
			} catch (error) {
				console.error("Error renewing token:", error);
				throw error;
			}
		},
		[agoraData],
	);

	const handleEndConversation = async () => {
		if (agoraData?.agentId) {
			try {
				await stopAgent(agoraData.agentId);
			} catch (nextError) {
				console.error("Failed to stop agent:", nextError);
			}
		}

		rtmClient?.logout().catch((err) => console.error("RTM logout error:", err));
		setRtmClient(null);
		setAgoraData(null);
		setShowConversation(false);

    // Redirect to Seller Dashboard to review leads
    router.push("/dashboard");
	};

  if (carLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0d0e12] text-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-400 mx-auto mb-4"></div>
          <p className="text-white/60 text-sm">Loading vehicle profile...</p>
        </div>
      </div>
    );
  }

  if (carError || !car) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0d0e12] text-white px-4">
        <div className="max-w-md w-full bg-[#151821] border border-red-500/20 rounded-2xl p-6 text-center shadow-xl">
          <svg className="h-12 w-12 text-red-400 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h3 className="text-xl font-bold mb-2">Error Loading Unit</h3>
          <p className="text-white/60 text-sm mb-6">{carError || "The requested car could not be found."}</p>
          <button 
            onClick={() => router.push("/dashboard")}
            className="w-full py-2.5 rounded-xl font-semibold bg-emerald-500 hover:bg-emerald-600 transition-colors text-white cursor-pointer"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-dvh min-h-screen flex-col overflow-hidden bg-[#0d0e12] text-white">
      {/* Pre-Call Lobby */}
      {!showConversation ? (
        <div className="flex-1 flex flex-col items-center justify-center px-4 py-12 text-center z-10">
          <div className="w-full max-w-lg bg-[#151821] border border-white/5 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
            {/* Ambient Background Glow */}
            <div className="absolute -top-24 -left-24 h-48 w-48 bg-emerald-500/10 rounded-full blur-3xl"></div>
            
            <div className="mb-2">
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest bg-emerald-500/10 px-3 py-1 rounded-full">
                Philippine Sales Agent
              </span>
            </div>
            
            <h1 className="text-3xl font-extrabold text-white mb-6">
              Talk to CARLO
            </h1>

            {/* Car profile details */}
            <div className="bg-[#0f1118]/80 border border-white/5 rounded-2xl p-6 mb-8 text-left">
              <div className="text-sm font-semibold text-white/40 mb-1">{car.year} {car.make}</div>
              <h2 className="text-2xl font-bold text-white mb-3">{car.model}</h2>
              <div className="text-2xl font-extrabold text-emerald-400 mb-6">₱{car.asking_price.toLocaleString()}</div>
              
              <div className="grid grid-cols-2 gap-y-3 gap-x-6 text-sm border-t border-white/5 pt-4">
                <div>
                  <span className="text-white/40 text-xs block">Location</span>
                  <span className="text-white/90 font-medium">{car.location}</span>
                </div>
                <div>
                  <span className="text-white/40 text-xs block">Mileage</span>
                  <span className="text-white/90 font-medium">{car.mileage.toLocaleString()} km</span>
                </div>
                <div>
                  <span className="text-white/40 text-xs block">Transmission</span>
                  <span className="text-white/90 font-medium">{car.transmission}</span>
                </div>
                <div>
                  <span className="text-white/40 text-xs block">Condition</span>
                  <span className="text-white/90 font-medium">{car.condition}</span>
                </div>
              </div>
            </div>

            {error && (
              <div className="mb-6 rounded-xl bg-red-500/15 border border-red-500/20 p-3 text-sm text-red-300">
                {error}
              </div>
            )}

            {/* Glowing call trigger button */}
            <button
              onClick={handleStartConversation}
              disabled={isLoading}
              className={`relative group w-full py-4 rounded-2xl font-bold text-lg text-white transition-all shadow-[0_0_20px_rgba(16,185,129,0.2)] hover:shadow-[0_0_30px_rgba(16,185,129,0.4)] cursor-pointer ${
                isLoading 
                  ? 'bg-emerald-600/40 border border-emerald-500/20 cursor-wait' 
                  : 'bg-emerald-500 border border-emerald-400 hover:bg-emerald-600 animate-pulse'
              }`}
            >
              {isLoading ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  <span>Calling Carlo...</span>
                </div>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                  </svg>
                  Negotiate Price Now
                </span>
              )}
            </button>
            
            <div className="mt-6">
              <Link 
                href="/dashboard"
                className="text-xs text-white/40 hover:text-emerald-400 transition-colors uppercase tracking-wider font-semibold"
              >
                Go to CRM Dashboard
              </Link>
            </div>
          </div>
        </div>
      ) : agoraData && rtmClient ? (
        <Suspense fallback={
          <div className="flex h-screen w-screen items-center justify-center bg-[#0d0e12] text-white">
            <LoadingSkeleton />
          </div>
        }>
          <ErrorBoundary>
            <AgoraProvider>
              <CARLOCallComponent
                agoraData={agoraData}
                rtmClient={rtmClient}
                onTokenWillExpire={handleTokenWillExpire}
                onEndConversation={handleEndConversation}
                car={car}
              />
            </AgoraProvider>
          </ErrorBoundary>
        </Suspense>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-white/40">Failed to load connection protocols.</p>
        </div>
      )}
    </div>
  );
}
