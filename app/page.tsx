import type { Metadata } from "next";
import FeedbackApp from "./FeedbackApp";

export const metadata: Metadata = {
  title: "Training Pulse | Ministry Learning Feedback",
  description: "A simple, confidential way to improve every ministry training.",
};

export default function Home() {
  return <FeedbackApp />;
}
