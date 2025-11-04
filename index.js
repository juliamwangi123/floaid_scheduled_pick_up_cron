// notificationReminder.js
const admin = require('firebase-admin');
const axios = require('axios');

// Parse Firebase service account credentials from environment variable
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://floaid-fd7ad-default-rtdb.firebaseio.com',
});

// OneSignal credentials
const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID;
const ONESIGNAL_API_KEY = process.env.ONESIGNAL_API_KEY;

// Android notification channel ID (must match the one you created in OneSignal)
const ANDROID_CHANNEL_ID = 'pickup_reminders';

// Function to send notification to a specific user
async function sendOneSignalNotification(userId, title, message) {
  try {
    const payload = {
      app_id: ONESIGNAL_APP_ID,
      include_external_user_ids: [userId],
      headings: { en: title },
      contents: { en: message },
      android_channel_id: ANDROID_CHANNEL_ID,
    };

    const headers = {
      Authorization: `Basic ${ONESIGNAL_API_KEY}`,
      'Content-Type': 'application/json',
    };

    const response = await axios.post(
      'https://onesignal.com/api/v1/notifications',
      payload,
      { headers }
    );

    console.log(`✅ Notification sent successfully to user: ${userId}`);
    return response.data;
  } catch (error) {
    console.error(`❌ Failed to send notification to user: ${userId}`);
    console.error('Details:', error.response?.data || error.message);
    return null;
  }
}

// Main function: checks Firebase for pickups happening in 3 days
async function checkAndSendReminders() {
  console.log('🚀 Starting pickup reminder process...');
  console.log('⏰ Current time:', new Date().toISOString());

  try {
    // Calculate the date 3 days from now
    const today = new Date();
    const threeDaysFromNow = new Date(today);
    threeDaysFromNow.setDate(today.getDate() + 3);

    // Format as YYYY-MM-DD (to match your stored pickupDate format)
    const targetDate = threeDaysFromNow.toISOString().split('T')[0];

    console.log('📅 Checking for pickups scheduled on:', targetDate);

    // Query Firebase Realtime Database
    const snapshot = await admin
      .database()
      .ref('scheduled_pickups')
      .orderByChild('pickupDate')
      .equalTo(targetDate)
      .once('value');

    const pickups = snapshot.val();

    if (!pickups || Object.keys(pickups).length === 0) {
      console.log(`ℹ️ No pickups found for ${targetDate}.`);
      return;
    }

    console.log(`✅ Found ${Object.keys(pickups).length} pickup(s) scheduled.`);

    // Prepare and send notifications
    const notificationPromises = Object.entries(pickups).map(
      async ([pickupId, pickup]) => {
        console.log(`📤 Sending reminder to: ${pickup.fullName} (${pickup.uId})`);
        return sendOneSignalNotification(
          pickup.uId,
          'Pickup Reminder 📦',
          `Hi ${pickup.fullName}! Your donation pickup is in 3 days. Please have your items ready for collection. Thank you for your generosity! 💚`
        );
      }
    );

    await Promise.all(notificationPromises);

    console.log(`✨ Successfully sent ${notificationPromises.length} reminder(s)!`);
  } catch (error) {
    console.error('❌ Error during reminder check:', error);
  } finally {
    console.log('🏁 Process complete.');
    process.exit(0);
  }
}

checkAndSendReminders();
