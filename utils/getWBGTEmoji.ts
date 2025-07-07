/**
 * Get the WBGT emoji based on the heat stress level.
 * @param heatStress
 */
export default function getWBGTEmoji(heatStress: string): string {
    const heatStressLower = heatStress.toLowerCase();

    if (heatStressLower.includes("low")) {
        return "🟢"; // Green for low heat stress
    } else if (heatStressLower.includes("med")) {
        return "🟡"; // Yellow for moderate heat stress
    } else if (heatStressLower.includes("hi")) {
        return "🔴"; // Red for very high heat stress
    } else {
        return "⚪"; // White for unknown or other cases
    }
}
