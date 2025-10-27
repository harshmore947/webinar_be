"use strict";
/**
 * Real-Time Features Test Script
 *
 * This script tests the Socket.IO real-time features:
 * 1. Webinar End Event
 * 2. Resource Upload Event
 *
 * Usage: npx ts-node scripts/testRealtime.ts
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const socket_io_client_1 = require("socket.io-client");
const colors_1 = __importDefault(require("colors"));
const SERVER_URL = process.env.SERVER_URL || "http://localhost:5000";
const JWT_TOKEN = process.env.TEST_JWT_TOKEN || "";
const results = [];
// Test Configuration
const TEST_CONFIG = {
    webinarId: process.env.TEST_WEBINAR_ID || "test-webinar-123",
    timeout: 5000, // 5 seconds
};
/**
 * Create a socket connection
 */
function createSocket(name) {
    return new Promise((resolve, reject) => {
        const socket = (0, socket_io_client_1.io)(SERVER_URL, {
            auth: {
                token: JWT_TOKEN,
            },
            transports: ["websocket", "polling"],
        });
        socket.on("connect", () => {
            console.log(colors_1.default.green(`✅ ${name} connected: ${socket.id}`));
            resolve(socket);
        });
        socket.on("connect_error", (error) => {
            console.log(colors_1.default.red(`❌ ${name} connection error: ${error.message}`));
            reject(error);
        });
        setTimeout(() => {
            if (!socket.connected) {
                reject(new Error(`Connection timeout for ${name}`));
            }
        }, TEST_CONFIG.timeout);
    });
}
/**
 * Test 1: Webinar End Real-Time
 */
function testWebinarEndRealtime() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(colors_1.default.cyan("\n🧪 TEST 1: Webinar End Real-Time Event"));
        console.log(colors_1.default.gray("=".repeat(60)));
        try {
            // Create observer socket
            const observerSocket = yield createSocket("Observer");
            // Join webinar room
            observerSocket.emit("join_webinar", { webinarId: TEST_CONFIG.webinarId });
            console.log(colors_1.default.blue(`📍 Observer joined room: webinar_${TEST_CONFIG.webinarId}`));
            // Set up listener with timeout
            const startTime = Date.now();
            return new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    observerSocket.disconnect();
                    resolve({
                        test: "Webinar End Real-Time",
                        passed: false,
                        error: "Timeout: Event not received within 5 seconds",
                    });
                }, TEST_CONFIG.timeout);
                observerSocket.on("webinar_ended", (data) => {
                    const latency = Date.now() - startTime;
                    clearTimeout(timeout);
                    console.log(colors_1.default.green("✅ Event received!"));
                    console.log(colors_1.default.yellow("📦 Event data:"), JSON.stringify(data, null, 2));
                    console.log(colors_1.default.magenta(`⚡ Latency: ${latency}ms`));
                    observerSocket.disconnect();
                    resolve({
                        test: "Webinar End Real-Time",
                        passed: true,
                        latency,
                    });
                });
                // Simulate webinar end (you'll need to trigger this manually or via API)
                console.log(colors_1.default.yellow("\n⏳ Waiting for 'webinar_ended' event..."));
                console.log(colors_1.default.gray("   (Trigger this by ending a webinar in the app)"));
            });
        }
        catch (error) {
            return {
                test: "Webinar End Real-Time",
                passed: false,
                error: error.message,
            };
        }
    });
}
/**
 * Test 2: Resource Upload Real-Time
 */
function testResourceUploadRealtime() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(colors_1.default.cyan("\n🧪 TEST 2: Resource Upload Real-Time Event"));
        console.log(colors_1.default.gray("=".repeat(60)));
        try {
            // Create observer socket
            const observerSocket = yield createSocket("Observer");
            // Join webinar room
            observerSocket.emit("join_webinar", { webinarId: TEST_CONFIG.webinarId });
            console.log(colors_1.default.blue(`📍 Observer joined room: webinar_${TEST_CONFIG.webinarId}`));
            // Set up listener with timeout
            const startTime = Date.now();
            return new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    observerSocket.disconnect();
                    resolve({
                        test: "Resource Upload Real-Time",
                        passed: false,
                        error: "Timeout: Event not received within 5 seconds",
                    });
                }, TEST_CONFIG.timeout);
                observerSocket.on("resource_uploaded", (data) => {
                    const latency = Date.now() - startTime;
                    clearTimeout(timeout);
                    console.log(colors_1.default.green("✅ Event received!"));
                    console.log(colors_1.default.yellow("📦 Event data:"), JSON.stringify(data, null, 2));
                    console.log(colors_1.default.magenta(`⚡ Latency: ${latency}ms`));
                    observerSocket.disconnect();
                    resolve({
                        test: "Resource Upload Real-Time",
                        passed: true,
                        latency,
                    });
                });
                // Simulate resource upload
                console.log(colors_1.default.yellow("\n⏳ Waiting for 'resource_uploaded' event..."));
                console.log(colors_1.default.gray("   (Trigger this by uploading a resource in the app)"));
            });
        }
        catch (error) {
            return {
                test: "Resource Upload Real-Time",
                passed: false,
                error: error.message,
            };
        }
    });
}
/**
 * Test 3: Connection Test
 */
function testConnection() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(colors_1.default.cyan("\n🧪 TEST 3: Socket.IO Connection"));
        console.log(colors_1.default.gray("=".repeat(60)));
        try {
            const startTime = Date.now();
            const socket = yield createSocket("Connection Test");
            const latency = Date.now() - startTime;
            console.log(colors_1.default.green("✅ Connection successful!"));
            console.log(colors_1.default.yellow("🔌 Socket ID:"), socket.id);
            console.log(colors_1.default.magenta(`⚡ Connection time: ${latency}ms`));
            console.log(colors_1.default.blue("🚀 Transport:"), socket.io.engine.transport.name);
            socket.disconnect();
            return {
                test: "Socket.IO Connection",
                passed: true,
                latency,
            };
        }
        catch (error) {
            return {
                test: "Socket.IO Connection",
                passed: false,
                error: error.message,
            };
        }
    });
}
/**
 * Print test results
 */
function printResults() {
    console.log(colors_1.default.cyan("\n📊 TEST RESULTS"));
    console.log(colors_1.default.gray("=".repeat(60)));
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;
    results.forEach((result) => {
        if (result.passed) {
            console.log(colors_1.default.green(`✅ ${result.test}`), result.latency ? colors_1.default.gray(`(${result.latency}ms)`) : "");
        }
        else {
            console.log(colors_1.default.red(`❌ ${result.test}`));
            if (result.error) {
                console.log(colors_1.default.red(`   Error: ${result.error}`));
            }
        }
    });
    console.log(colors_1.default.gray("=".repeat(60)));
    console.log(colors_1.default.white(`Total: ${results.length} tests`));
    console.log(colors_1.default.green(`Passed: ${passed}`));
    console.log(colors_1.default.red(`Failed: ${failed}`));
    const avgLatency = results
        .filter((r) => r.latency)
        .reduce((sum, r) => sum + r.latency, 0) / passed;
    if (avgLatency) {
        console.log(colors_1.default.magenta(`Average Latency: ${avgLatency.toFixed(0)}ms`));
    }
    console.log(colors_1.default.gray("=".repeat(60)));
    if (failed === 0) {
        console.log(colors_1.default.green.bold("\n🎉 ALL TESTS PASSED! Real-time features are working!"));
    }
    else {
        console.log(colors_1.default.red.bold("\n⚠️ SOME TESTS FAILED. Check the errors above."));
    }
}
/**
 * Main test runner
 */
function runTests() {
    return __awaiter(this, void 0, void 0, function* () {
        console.log(colors_1.default.cyan.bold("\n🚀 REAL-TIME FEATURES TEST SUITE"));
        console.log(colors_1.default.gray("Server: " + SERVER_URL));
        console.log(colors_1.default.gray("Webinar ID: " + TEST_CONFIG.webinarId));
        console.log(colors_1.default.gray("=".repeat(60)));
        if (!JWT_TOKEN) {
            console.log(colors_1.default.yellow("\n⚠️ WARNING: No JWT token provided"));
            console.log(colors_1.default.gray("   Set TEST_JWT_TOKEN environment variable for authenticated tests"));
            console.log(colors_1.default.gray("   Continuing with unauthenticated tests..."));
        }
        try {
            // Test 3: Connection (fast, run first)
            const connectionResult = yield testConnection();
            results.push(connectionResult);
            if (!connectionResult.passed) {
                console.log(colors_1.default.red.bold("\n❌ Connection failed. Skipping other tests."));
                printResults();
                process.exit(1);
            }
            // Manual tests (require user interaction)
            console.log(colors_1.default.yellow("\n⏳ Manual Test Mode:"));
            console.log(colors_1.default.gray("   The following tests require you to trigger events in the app:"));
            console.log(colors_1.default.gray("   1. End a webinar"));
            console.log(colors_1.default.gray("   2. Upload a resource"));
            console.log(colors_1.default.gray("\n   Press Ctrl+C to skip manual tests and see results.\n"));
            // Test 1: Webinar End
            const webinarEndResult = yield testWebinarEndRealtime();
            results.push(webinarEndResult);
            // Test 2: Resource Upload
            const resourceUploadResult = yield testResourceUploadRealtime();
            results.push(resourceUploadResult);
        }
        catch (error) {
            console.log(colors_1.default.red("\n❌ Test suite error:"), error.message);
        }
        finally {
            printResults();
            process.exit(results.every((r) => r.passed) ? 0 : 1);
        }
    });
}
// Handle Ctrl+C gracefully
process.on("SIGINT", () => {
    console.log(colors_1.default.yellow("\n\n⏸️ Tests interrupted by user"));
    printResults();
    process.exit(0);
});
// Run tests
runTests();
