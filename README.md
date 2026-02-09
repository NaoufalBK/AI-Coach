# Omnexa

**Bridging the gap between raw motion data and expert coaching.**

Omnexa is an advanced fitness and performance platform that uses **Gemini 3** and **MediaPipe** to interpret biometric data in real-time. Instead of isolated metrics, Omnexa treats the human body as a connected, dynamic system, offering expert-level reasoning, audio coaching, and personalized nutrition insights.

## Inspiration
Modern fitness and performance tools generate massive amounts of data, yet most athletes and everyday users still rely on generic feedback or post-workout analysis. The inspiration for Omnexa came from a simple question: 

> *What if raw biometric data could be interpreted in real time with the reasoning ability of an expert coach?* We wanted to close the gap between motion capture, training history, and nutrition by building a system that understands the human body as a connected, dynamic system rather than isolated metrics.

## What We Learned
Building Omnexa highlighted the importance of **structured data** when working with large multimodal models. We learned how Gemini 3’s reasoning capabilities can be significantly amplified by providing clean biomechanical inputs such as joint angles and motion phases, and by enforcing structured outputs through response schemas. We also gained practical experience designing low-latency feedback loops, where inference speed and clarity of feedback directly impact the user experience.

## How We Built It
Omnexa was built by combining real-time pose estimation using **MediaPipe** with **Gemini 3** as the central reasoning engine. 

* **Motion Analysis:** Joint angles and movement phases are computed and passed to Gemini 3, which evaluates exercise quality and returns structured JSON feedback that drives the user interface. 
* **Audio Coaching:** Audio coaching is generated using Text-to-Speech, enabling hands-free corrections during training. 
* **Session Tracking:** The platform also includes session tracking for logging exercises, sets, repetitions, and total volume.
* **Nutrition Vault:** Gemini 3 parses natural language meal entries and computes personalized macronutrient targets. 

Concepts such as total daily energy expenditure are modeled using Gemini reasoning

## Challenges
One of the main challenges was achieving reliable real-time feedback without overwhelming the user. Balancing inference latency, structured outputs, and meaningful coaching cues required careful prompt design and iteration. Another challenge was ensuring biomechanical feedback remained accurate across different body types and movement patterns, which reinforced the need for precise kinematic representations and conservative reasoning thresholds.

## Testing & Configuration

To run this project locally, you need to configure the environment variables for the API connection.

1.  Create a file named `.env.local` in the root directory.
2.  Add the following variables:

```env
VITE_GEMINI_API_KEY=your_api_key_here
VITE_MODEL=gemini-3-flash-preview
