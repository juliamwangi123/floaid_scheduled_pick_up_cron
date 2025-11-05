const cron = require('node-cron');
const admin = require('firebase-admin');
const axios = require('axios');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://floaid-fd7ad-default-rtdb.firebaseio.com'
});

// OneSignal credentials
const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID;
const ONESIGNAL_API_KEY = process.env.ONESIGNAL_API_KEY;

async function sendOneSignalNotification(userId, title, message) {
  try {
    const response = await axios.post(
      'https://onesignal.com/api/v1/notifications',
      {
        app_id: ONESIGNAL_APP_ID,
        include_external_user_ids: [userId],
        headings: { en: title },
        contents: { en: message },
        android_channel_id: 'pickup_reminders'
      },
      {
        headers: {
          'Authorization': `Basic ${ONESIGNAL_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('✅ Notification sent to user:', userId);
    return response.data;
  } catch (error) {
    console.error('❌ Error sending notification to user:', userId);
    console.error('Details:', error.response?.data || error.message);
    return null;
  }
}

async function checkAndSendReminders() {
  console.log('🚀 Starting pickup reminder check...');
  console.log('⏰ Current time:', new Date().toISOString());
  
  try {
    // Calculate date 3 days from now
    const today = new Date();
    const threeDaysFromNow = new Date(today);
    threeDaysFromNow.setDate(today.getDate() + 3);
    
    // Format as YYYY-MM-DD
    const targetDate = threeDaysFromNow.toISOString().split('T')[0];
    
    console.log('📅 Looking for pickups scheduled on:', targetDate);
    
    // Query Firebase Realtime Database
    const snapshot = await admin.database()
      .ref('scheduled_pickups')
      .orderByChild('pickupDate')
      .equalTo(targetDate)
      .once('value');
    
    const pickups = snapshot.val();
    
    if (!pickups || Object.keys(pickups).length === 0) {
      console.log('ℹ️ No pickups found for', targetDate);
      return;
    }
    
    console.log('✅ Found', Object.keys(pickups).length, 'pickup(s)');
    
    // Send notification to each user
    const promises = [];
    
    for (const pickupId in pickups) {
      const pickup = pickups[pickupId];
      
      console.log('📤 Preparing notification for:', pickup.fullName, `(${pickup.uId})`);
      
      promises.push(
        sendOneSignalNotification(
          pickup.uId,
          'Pickup Reminder 📦',
          `Hi ${pickup.fullName}! Your donation pickup is in 3 days. Please have your items ready for collection. Thank you for your generosity! 💚`
        )
      );
    }
    
    // Wait for all notifications
    await Promise.all(promises);
    
    console.log('✨ Successfully sent', promises.length, 'reminder(s)');
    
  } catch (error) {
    console.error('❌ Error in checkAndSendReminders:', error);
  }
}

// Schedule cron job to run every day at 9:00 AM East Africa Time
// EAT is UTC+3, so 9 AM EAT = 6 AM UTC
cron.schedule('0 6 * * *', () => {
  console.log('⏰ Cron job triggered at:', new Date().toISOString());
  checkAndSendReminders();
}, {
  timezone: 'Africa/Nairobi'
});

// Express routes (to keep service alive and for health checks)
app.get('/', (req, res) => {
  res.json({
    status: 'running',
    message: 'Pickup Reminder Service is active! 🚀',
    nextRun: 'Every day at 9:00 AM EAT'
  });
});

// Manual trigger endpoint (for testing)
app.get('/trigger', async (req, res) => {
  console.log('📲 Manual trigger requested');
  res.json({ status: 'triggered', message: 'Checking for reminders...' });
  await checkAndSendReminders();
});

// Start the server
app.listen(PORT, () => {
  console.log('🚀 Pickup Reminder Service started!');
  console.log(`🌐 Server running on port ${PORT}`);
  console.log('⏰ Scheduled to run every day at 9:00 AM EAT');
  console.log('📅 Current time:', new Date().toISOString());
  
  // Run once on startup for testing
  console.log('🔄 Running initial check...');
  checkAndSendReminders();
});