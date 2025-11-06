const cron = require('node-cron');
const admin = require('firebase-admin');
const axios = require('axios');
const express = require('express');
require('dotenv').config()

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

function getDaysUntilPickup(pickupDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const pickup = new Date(pickupDate);
  pickup.setHours(0, 0, 0, 0);
  
  const diffTime = pickup - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
}

function getNotificationMessage(fullName, daysUntil) {
  switch(daysUntil) {
    case 0:
      return `Hi ${fullName}! Your donation pickup is TODAY! Please have your items ready for collection. Thank you for your generosity! 💚`;
    case 1:
      return `Hi ${fullName}! Your donation pickup is TOMORROW! Please have your items ready for collection. Thank you for your generosity! 💚`;
    case 2:
      return `Hi ${fullName}! Your donation pickup is in 2 days. Please have your items ready for collection. Thank you for your generosity! 💚`;
    case 3:
      return `Hi ${fullName}! Your donation pickup is in 3 days. Please have your items ready for collection. Thank you for your generosity! 💚`;
    default:
      return `Hi ${fullName}! Your donation pickup is coming up. Please have your items ready for collection. Thank you for your generosity! 💚`;
  }
}

async function checkAndSendReminders() {
  console.log('🚀 Starting pickup reminder check...');
  console.log('⏰ Current time:', new Date().toISOString());
  
  try {
    const today = new Date();
    
    // Calculate dates for today, tomorrow, 2 days, and 3 days from now
    const dates = [];
    for (let i = 0; i <= 3; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      dates.push(date.toISOString().split('T')[0]);
    }
    
    console.log('📅 Looking for pickups on:', dates);
    
    // Get all scheduled pickups
    const snapshot = await admin.database()
      .ref('scheduled_pickups')
      .once('value');
    
    const allPickups = snapshot.val();
    
    if (!allPickups) {
      console.log('ℹ️ No pickups found in database');
      return;
    }
    
    // Filter pickups that fall within the 3-day window
    const upcomingPickups = [];
    
    for (const pickupId in allPickups) {
      const pickup = allPickups[pickupId];
      
      if (dates.includes(pickup.pickupDate)) {
        const daysUntil = getDaysUntilPickup(pickup.pickupDate);
        upcomingPickups.push({
          ...pickup,
          pickupId,
          daysUntil
        });
      }
    }
    
    if (upcomingPickups.length === 0) {
      console.log('ℹ️ No pickups found within the next 3 days');
      return;
    }
    
    console.log('✅ Found', upcomingPickups.length, 'upcoming pickup(s)');
    
    // Send notification to each user
    const promises = [];
    
    for (const pickup of upcomingPickups) {
      console.log(`📤 Preparing notification for: ${pickup.fullName} (${pickup.uId}) - ${pickup.daysUntil} day(s) until pickup`);
      
      const message = getNotificationMessage(pickup.fullName, pickup.daysUntil);
      
      promises.push(
        sendOneSignalNotification(
          pickup.uId,
          'Pickup Reminder 📦',
          message
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

// Schedule cron job to run every day at 10:00 AM East Africa Time
// EAT is UTC+3, so 10 AM EAT = 7 AM UTC
cron.schedule('0 7 * * *', () => {
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
    nextRun: 'Every day at 10:00 AM EAT'
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
  console.log('⏰ Scheduled to run every day at 10:00 AM EAT');
  console.log('📅 Current time:', new Date().toISOString());
  
  // Run once on startup for testing
  console.log('🔄 Running initial check...');
  checkAndSendReminders();
});