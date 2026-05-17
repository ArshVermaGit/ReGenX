/**
 * @fileoverview ReGenX IoT Hardware Bridge
 * Handles real-time telemetry from IoT Sensory Bins, AI Anomaly Detection,
 * and Automated Dispatch hooks.
 * @author GSSoC Contributor
 */

export const IoTBridge = {
    /**
     * Analyzes telemetry data for rapid deviations and anomalies.
     * @param {Object} bin - Current bin telemetry state.
     * @param {Object} prevBin - Previous bin telemetry state.
     * @returns {Array<string>} List of detected anomaly warnings.
     */
    detectAnomalies: (bin, prevBin) => {
        const anomalies = [];
        if (!prevBin) return anomalies;

        // Anomaly: Rapid Temperature Spike (Potential Fire Risk)
        if (bin.temp && prevBin.temp) {
            const tempDiff = bin.temp - prevBin.temp;
            if (tempDiff >= 5) {
                anomalies.push(`CRITICAL: Rapid Temp Spike Detected (+${tempDiff.toFixed(1)}°C). Fire risk!`);
            }
        }

        // Anomaly: Methane Leak
        if (bin.methane && bin.methane > 20) {
            anomalies.push(`WARNING: High CH4 Levels (${bin.methane.toFixed(1)} ppm). Gas leak detected!`);
        }

        return anomalies;
    },

    /**
     * Checks if a bin requires automated dispatching.
     * @param {Object} bin - Current bin telemetry.
     * @returns {boolean} True if auto-dispatch is triggered.
     */
    shouldAutoDispatch: (bin) => {
        return bin.fill >= 90;
    },

    /**
     * Formats telemetry data for the Data Grid view.
     * @param {Object} bin 
     * @returns {Object} Formatted row data
     */
    formatGridRow: (bin) => {
        return {
            id: bin.id,
            name: bin.name,
            fill: `${bin.fill}%`,
            temp: bin.temp ? `${bin.temp}°C` : '--',
            humidity: bin.humidity ? `${bin.humidity}%` : '--',
            methane: bin.methane ? `${bin.methane} ppm` : '--',
            status: bin.status === 'offline' ? 'Offline' : (bin.fill >= 85 ? 'Critical' : 'Active')
        };
    }
};
