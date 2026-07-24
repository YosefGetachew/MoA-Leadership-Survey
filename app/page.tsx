import type { Metadata } from "next";
import FeedbackApp from "./FeedbackApp";

export const metadata: Metadata = {
  title: "Training Pulse | Ministry of Agriculture",
  description: "A simple, confidential way to improve Ministry of Agriculture training.",
};

export default function Home() {
  return <FeedbackApp />;
}
