"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MicrophoneSelector } from "@/components/MicrophoneSelector";
import { DEFAULT_AGENT_UID } from "@/lib/agora";
import {
	getCurrentInProgressMessage,
	getMessageList,
	normalizeTimestampMs,
	normalizeTranscript,
} from "@/lib/conversation";
import type { ConversationComponentProps } from "@/types/conversation";
import {
	type AgentState,
	type AgentTranscription,
	AgoraVoiceAI,
	AgoraVoiceAIEvents,
	type TranscriptHelperItem,
	TranscriptHelperMode,
	type UserTranscription,
} from "agora-agent-client-toolkit";
import {
	RemoteUser,
	type UID,
	useClientEvent,
	useJoin,
	useLocalMicrophoneTrack,
	usePublish,
	useRTCClient,
	useRemoteUsers,
} from "agora-rtc-react";
import { setParameter } from "agora-rtc-sdk-ng/esm";
import { Car } from "@/services/api";

interface CARLOCallComponentProps extends ConversationComponentProps {
  car: Car;
}

export default function CARLOCallComponent({
	agoraData,
	rtmClient,
	onTokenWillExpire,
	onEndConversation,
  car
}: CARLOCallComponentProps) {
	const client = useRTCClient();
	const remoteUsers = useRemoteUsers();
	const router = useRouter();
	
	const [isEnabled, setIsEnabled] = useState(true);
	const [isAgentConnected, setIsAgentConnected] = useState(false);
	const [connectionState, setConnectionState] = useState<string>("CONNECTING");
	const [seconds, setSeconds] = useState(0);
	
	const agentUID = agoraData.agentUid ?? String(DEFAULT_AGENT_UID);
	const [joinedUID, setJoinedUID] = useState<UID>(0);

	const [rawTranscript, setRawTranscript] = useState<
		TranscriptHelperItem<Partial<UserTranscription | AgentTranscription>>[]
	>([]);
	const [agentState, setAgentState] = useState<AgentState | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

	const [isReady, setIsReady] = useState(false);
	useEffect(() => {
		let cancelled = false;
		const id = setTimeout(() => {
			if (!cancelled) setIsReady(true);
		}, 0);
		return () => {
			cancelled = true;
			clearTimeout(id);
			setIsReady(false);
		};
	}, []);

	const appId = agoraData.appId ?? "";

	const { isConnected: joinSuccess } = useJoin(
		{
			appid: appId,
			channel: agoraData.channel,
			token: agoraData.token,
			uid: Number.parseInt(agoraData.uid, 10),
		},
		isReady,
	);

	const { localMicrophoneTrack } = useLocalMicrophoneTrack(isReady);

	useEffect(() => {
		if (!client) return;
		try {
			setParameter("ENABLE_AUDIO_PTS", true);
		} catch (error) {
			console.warn("Could not set ENABLE_AUDIO_PTS:", error);
		}
	}, [client]);

	useEffect(() => {
		if (joinSuccess && client) {
			const uid = client.uid;
			if (uid !== null && uid !== undefined) {
				setJoinedUID(uid);
			}
		}
	}, [joinSuccess, client]);

	// Session Timer
	useEffect(() => {
		if (connectionState !== "CONNECTED") return;
		const interval = setInterval(() => {
			setSeconds((s) => s + 1);
		}, 1000);
		return () => clearInterval(interval);
	}, [connectionState]);

	useEffect(() => {
		if (!isReady || !joinSuccess) return;

		let cancelled = false;
		(async () => {
			try {
				const ai = await AgoraVoiceAI.init({
					rtcEngine: client,
					rtmConfig: { rtmEngine: rtmClient },
					renderMode: TranscriptHelperMode.TEXT,
					enableLog: true,
				});

				if (cancelled) {
					try {
						if (AgoraVoiceAI.getInstance() === ai) {
							ai.unsubscribe();
							ai.destroy();
						}
					} catch {}
					return;
				}

				ai.on(AgoraVoiceAIEvents.TRANSCRIPT_UPDATED, (t) => {
					setRawTranscript([...t]);
				});
				ai.on(AgoraVoiceAIEvents.AGENT_STATE_CHANGED, (_, event) =>
					setAgentState(event.state),
				);
				ai.subscribeMessage(agoraData.channel);
			} catch (error) {
				if (!cancelled) {
					console.error("[AgoraVoiceAI] init failed:", error);
				}
			}
		})();

		return () => {
			cancelled = true;
			try {
				const ai = AgoraVoiceAI.getInstance();
				if (ai) {
					ai.unsubscribe();
					ai.destroy();
				}
			} catch {}
		};
	}, [
		isReady,
		joinSuccess,
		client,
		rtmClient,
		agoraData.channel,
	]);

	const transcript = useMemo(() => {
		return normalizeTranscript(rawTranscript, String(client.uid));
	}, [rawTranscript, client.uid]);

	const messageList = useMemo(() => getMessageList(transcript), [transcript]);

	const currentInProgressMessage = useMemo(() => {
		return getCurrentInProgressMessage(transcript);
	}, [transcript]);

	// Auto-scroll transcript
	useEffect(() => {
		transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messageList, currentInProgressMessage]);

	usePublish([localMicrophoneTrack]);

	useClientEvent(client, "user-joined", (user) => {
		if (user.uid.toString() === agentUID) setIsAgentConnected(true);
	});

	useClientEvent(client, "user-left", (user) => {
		if (user.uid.toString() === agentUID) setIsAgentConnected(false);
	});

	useEffect(() => {
		const isAgentInRemoteUsers = remoteUsers.some(
			(user) => user.uid.toString() === agentUID,
		);
		setIsAgentConnected(isAgentInRemoteUsers);
	}, [remoteUsers, agentUID]);

	useClientEvent(client, "connection-state-change", (curState) => {
		setConnectionState(curState);
	});

	const handleMicToggle = useCallback(async () => {
		const next = !isEnabled;
		const track = localMicrophoneTrack;
		if (!track) {
			setIsEnabled(next);
			return;
		}
		try {
			await track.setEnabled(next);
			setIsEnabled(next);
		} catch (error) {
			console.error("Failed to toggle microphone:", error);
		}
	}, [isEnabled, localMicrophoneTrack]);

	const handleTokenWillExpire = useCallback(async () => {
		if (!onTokenWillExpire || !joinedUID) return;
		try {
			const { rtcToken, rtmToken } = await onTokenWillExpire(
				joinedUID.toString(),
			);
			await client?.renewToken(rtcToken);
			await rtmClient.renewToken(rtmToken);
		} catch (error) {
			console.error("Failed to renew Agora token:", error);
		}
	}, [client, onTokenWillExpire, joinedUID, rtmClient]);

	useClientEvent(client, "token-privilege-will-expire", handleTokenWillExpire);

	const handleEndConversation = useCallback(async () => {
		const track = localMicrophoneTrack;
		if (track) {
			try {
				await client?.unpublish(track);
			} catch (error) {
				console.warn("Failed to unpublish microphone track:", error);
			}

			try {
				track.stop();
				track.close();
			} catch (error) {
				console.warn("Failed to release microphone track:", error);
			}
		}

		onEndConversation();
	}, [client, localMicrophoneTrack, onEndConversation]);

	const formatDuration = (totalSecs: number) => {
		const mins = Math.floor(totalSecs / 60);
		const secs = totalSecs % 60;
		return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
	};

	const isSpeaking = agentState === "speaking";
	const isThinking = agentState === "thinking";
	const isListening = agentState === "listening" || (!isSpeaking && !isThinking && isAgentConnected);

	return (
		<div className="relative flex flex-col h-full w-full bg-[#0d0e12] text-white">
			{/* Top Bar */}
			<header className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-[#11131a]/85 backdrop-blur-md">
				<div className="flex items-center gap-2">
					<div className="relative flex h-3 w-3">
						<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
						<span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
					</div>
					<span className="font-bold text-lg tracking-wider text-emerald-400">CARLO</span>
					<span className="text-xs text-white/50 px-2 py-0.5 rounded bg-white/5 font-mono">v1.2</span>
				</div>
				
				<div className="flex items-center gap-4">
					<div className="text-sm font-mono text-white/80 bg-white/5 px-3 py-1 rounded-full">
						{formatDuration(seconds)}
					</div>
					<button
						onClick={handleEndConversation}
						className="px-4 py-1.5 rounded-full text-xs font-semibold bg-red-500/20 border border-red-500/30 text-red-300 hover:bg-red-500/30 transition-all cursor-pointer"
					>
						End Call
					</button>
				</div>
			</header>

			{/* Main Content Area */}
			<div className="flex flex-1 flex-col md:flex-row min-h-0">
				
				{/* Left Side: Car Spec Card and Agent State */}
				<div className="flex-1 flex flex-col items-center justify-center p-6 border-b md:border-b-0 md:border-r border-white/5 bg-[#0f1118]">
					<div className="w-full max-w-sm rounded-2xl bg-[#151821] border border-white/5 p-6 shadow-xl mb-8">
						<div className="text-xs font-semibold uppercase tracking-wider text-emerald-400 mb-1">
							{car.year} Model
						</div>
						<h2 className="text-2xl font-bold text-white mb-2">
							{car.make} {car.model}
						</h2>
						<div className="text-3xl font-extrabold text-white/95 mb-6">
							₱{car.asking_price.toLocaleString()}
						</div>
						
						<div className="grid grid-cols-2 gap-4 text-sm border-t border-white/5 pt-4">
							<div>
								<span className="text-white/40 block text-xs">Milage</span>
								<span className="font-medium text-white/90">{car.mileage.toLocaleString()} km</span>
							</div>
							<div>
								<span className="text-white/40 block text-xs">Transmission</span>
								<span className="font-medium text-white/90">{car.transmission}</span>
							</div>
							<div>
								<span className="text-white/40 block text-xs">Fuel Type</span>
								<span className="font-medium text-white/90">{car.fuel_type}</span>
							</div>
							<div>
								<span className="text-white/40 block text-xs">Location</span>
								<span className="font-medium text-white/90">{car.location}</span>
							</div>
						</div>
					</div>

					{/* Breathing status and waveform */}
					<div className="flex flex-col items-center justify-center text-center">
						<div className="mb-4">
							{connectionState !== "CONNECTED" ? (
								<div className="text-white/40 text-sm animate-pulse">Connecting audio stream...</div>
							) : !isAgentConnected ? (
								<div className="text-white/40 text-sm animate-pulse">Waiting for CARLO to pick up...</div>
							) : isSpeaking ? (
								<span className="text-emerald-400 text-sm font-semibold uppercase tracking-wider">CARLO is Speaking</span>
							) : isThinking ? (
								<span className="text-amber-400 text-sm font-semibold uppercase tracking-wider animate-pulse">CARLO is Thinking</span>
							) : (
								<span className="text-white/50 text-sm font-semibold uppercase tracking-wider">Listening to you</span>
							)}
						</div>

						{/* Interactive wave visualizer */}
						<div className="flex items-end justify-center gap-1.5 h-16 w-48 mb-4">
							{connectionState === "CONNECTED" && isAgentConnected ? (
								<>
									<div className={`w-1.5 bg-emerald-400 rounded-full transition-all duration-300 ${isSpeaking ? 'animate-[bounce_0.8s_infinite_0.1s]' : isThinking ? 'animate-[pulse_1s_infinite_0.1s] h-4' : 'h-2'}`} style={{ height: isSpeaking ? '32px' : undefined }}></div>
									<div className={`w-1.5 bg-emerald-400 rounded-full transition-all duration-300 ${isSpeaking ? 'animate-[bounce_0.8s_infinite_0.2s]' : isThinking ? 'animate-[pulse_1s_infinite_0.2s] h-6' : 'h-2'}`} style={{ height: isSpeaking ? '48px' : undefined }}></div>
									<div className={`w-1.5 bg-emerald-400 rounded-full transition-all duration-300 ${isSpeaking ? 'animate-[bounce_0.8s_infinite_0.3s]' : isThinking ? 'animate-[pulse_1s_infinite_0.3s] h-4' : 'h-2'}`} style={{ height: isSpeaking ? '24px' : undefined }}></div>
									<div className={`w-1.5 bg-emerald-400 rounded-full transition-all duration-300 ${isSpeaking ? 'animate-[bounce_0.8s_infinite_0.4s]' : isThinking ? 'animate-[pulse_1s_infinite_0.4s] h-8' : 'h-2'}`} style={{ height: isSpeaking ? '40px' : undefined }}></div>
									<div className={`w-1.5 bg-emerald-400 rounded-full transition-all duration-300 ${isSpeaking ? 'animate-[bounce_0.8s_infinite_0.5s]' : isThinking ? 'animate-[pulse_1s_infinite_0.5s] h-5' : 'h-2'}`} style={{ height: isSpeaking ? '16px' : undefined }}></div>
								</>
							) : (
								<div className="w-full flex justify-center text-xs text-white/20 font-mono">STANDBY</div>
							)}
						</div>
					</div>
				</div>

				{/* Right Side: Transcript Captions */}
				<div className="flex-1 flex flex-col h-full bg-[#0c0d12]">
					<div className="px-6 py-3 bg-[#11131a]/40 text-xs font-semibold text-white/40 border-b border-white/5 uppercase tracking-wider">
						Live Transcription
					</div>
					
					{/* Scrollable Conversation History */}
					<div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-white/10">
						{messageList.length === 0 && !currentInProgressMessage ? (
							<div className="h-full flex flex-col items-center justify-center text-white/20 text-sm italic">
								<p>Start speaking po to talk with CARLO.</p>
								<p className="text-xs text-white/10 mt-1">"Hello Carlo, magkano po ang Honda City?"</p>
							</div>
						) : (
							<>
								{messageList.map((msg, index) => {
									const isCarlo = String(msg.uid) === agentUID;
									return (
										<div key={index} className={`flex flex-col mb-5 ${isCarlo ? 'items-start' : 'items-end'}`}>
											<span className="text-[10px] uppercase font-bold text-white/30 tracking-wider mb-1">
												{isCarlo ? 'CARLO' : 'Customer'}
											</span>
											<div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
												isCarlo 
													? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded-tl-none font-medium' 
													: 'bg-white/5 border border-white/10 text-white rounded-tr-none'
											}`}>
												{msg.text}
											</div>
										</div>
									);
								})}
								{currentInProgressMessage && (
									<div className={`flex flex-col mb-5 ${String(currentInProgressMessage.uid) === agentUID ? 'items-start' : 'items-end'}`}>
										<span className="text-[10px] uppercase font-bold text-white/30 tracking-wider mb-1">
											{String(currentInProgressMessage.uid) === agentUID ? 'CARLO' : 'Customer'}
										</span>
										<div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm italic opacity-85 ${
											String(currentInProgressMessage.uid) === agentUID
												? 'bg-emerald-500/5 border border-emerald-500/10 text-emerald-300/80 rounded-tl-none'
												: 'bg-white/5 border border-white/5 text-white/80 rounded-tr-none'
										}`}>
											{currentInProgressMessage.text}...
										</div>
									</div>
								)}
								<div ref={transcriptEndRef} />
							</>
						)}
					</div>
					
					{/* Mute and Mic Controls */}
					<div className="p-6 border-t border-white/5 bg-[#0e1017]">
						<div className="flex items-center justify-between gap-4 max-w-md mx-auto">
							<button
								onClick={handleMicToggle}
								className={`flex h-12 w-12 items-center justify-center rounded-full border transition-all cursor-pointer ${
									isEnabled 
										? 'bg-emerald-500 border-emerald-400 text-white hover:bg-emerald-600 shadow-[0_0_15px_rgba(16,185,129,0.4)]' 
										: 'bg-red-500/20 border-red-500/30 text-red-400 hover:bg-red-500/30'
								}`}
								aria-label={isEnabled ? "Mute Microphone" : "Unmute Microphone"}
							>
								{isEnabled ? (
									<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
										<path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
									</svg>
								) : (
									<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
										<path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
										<path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
									</svg>
								)}
							</button>
							
							<div className="flex-1">
								<MicrophoneSelector localMicrophoneTrack={localMicrophoneTrack} />
							</div>
						</div>
					</div>
				</div>
			</div>

			{/* Dummy element for Agora remote voice streams */}
			{remoteUsers.map((user) => (
				<div key={user.uid} className="hidden">
					<RemoteUser user={user} />
				</div>
			))}
		</div>
	);
}
