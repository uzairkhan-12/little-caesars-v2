#!/usr/bin/env node

// Simple test to check API responses
const BASE_LC = "https://lclogic2.primewave2.tech";
const BASE_HA = "https://lcha2.primewave2.tech";

async function testLC(endpoint) {
  try {
    console.log(`\n📡 Testing LC: ${BASE_LC}${endpoint}`);
    const res = await fetch(`${BASE_LC}${endpoint}`, {
      headers: { Accept: "application/json" }
    });
    console.log(`Status: ${res.status}`);
    const data = await res.json();
    console.log("Response:", JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Error:", err.message);
  }
}

async function testHA(endpoint) {
  try {
    console.log(`\n📡 Testing HA: ${BASE_HA}${endpoint}`);
    const token = process.env.HOME_ASSISTANT_TOKEN;
    if (!token) {
      console.log("⚠️  HOME_ASSISTANT_TOKEN not set");
      return;
    }
    const res = await fetch(`${BASE_HA}${endpoint}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    });
    console.log(`Status: ${res.status}`);
    const data = await res.json();
    console.log("Response:", JSON.stringify(data, null, 2).slice(0, 500) + "...");
  } catch (err) {
    console.error("Error:", err.message);
  }
}

async function main() {
  console.log("🧪 Testing Little Caesars APIs...");
  await testLC("/api/counts");
  await testLC("/api/today");
  await testLC("/api/hourly");
  await testLC("/api/daily?days=14");
  await testLC("/api/events?limit=50");
  
  console.log("\n\n🧪 Testing Home Assistant APIs...");
  await testHA("/api/states");
}

main().catch(console.error);
