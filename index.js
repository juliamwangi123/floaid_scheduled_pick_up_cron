const admin = require('firebase-admin');
const axios = require('axios');


const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://floaid-fd7ad-default-rtdb.firebaseio.com'
});

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

// Main function
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
      process.exit(0);
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
    console.log('✅ Done!');
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error in checkAndSendReminders:', error);
    process.exit(1);
  }
}

// Run the function
checkAndSendReminders();