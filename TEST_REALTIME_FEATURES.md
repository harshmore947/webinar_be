# 🧪 **QUICK REAL-TIME TESTING GUIDE**

## **Fast Track Testing - 5 Minutes**

This guide will help you verify both real-time features are working correctly.

---

## 🎯 **Prerequisites**

1. ✅ Backend server running: `npm run dev` in `webinar_be/`
2. ✅ Frontend running: `npm run dev` in `webinar_fe/`
3. ✅ At least 2 user accounts (1 host, 1 attendee)
4. ✅ One webinar created and scheduled/live

---

## 🔥 **TEST 1: Real-Time Webinar End (2 minutes)**

### **Step 1: Setup**
```bash
# Open 2 browser windows side by side:
# Window 1: Host view
# Window 2: Attendee view
```

### **Step 2: Join Webinar**
1. **Window 1 (Host):** Login as host → Go to your webinar
2. **Window 2 (Attendee):** Login as attendee → Enroll → Go to same webinar

### **Step 3: Test Real-Time End**
1. **Window 1:** Click "End Webinar" button (usually at top-right)
2. **Watch Window 2:** Should see toast notification **instantly**

### **✅ Expected Results:**
- Window 2 shows: "Webinar Has Ended" toast **within 1 second**
- Both windows: Status changes to "ENDED" (red badge)
- Both windows: Certificate section appears (if enabled)

### **❌ If Not Working:**
```bash
# Check backend console:
grep "webinar_ended" logs/app-*.log

# Check browser console (F12):
# Should see: "🔴 Webinar ended event received"

# Verify Socket.IO connection:
# Network tab → Filter: WS → Should see "websocket" connection
```

---

## 📤 **TEST 2: Real-Time Resource Upload (2 minutes)**

### **Step 1: Stay in Same Windows**
- Keep both windows open from Test 1
- If webinar ended, create a new one or use scheduled webinar

### **Step 2: Upload Resource**
1. **Window 1 (Host):** Scroll to "Resources" section
2. Click "Upload Resource" or drag-and-drop a PDF
3. Upload completes

### **Step 3: Verify Real-Time Update**
1. **Watch Window 2 (Attendee):** New resource appears **instantly**
2. Both windows show the new resource in the list

### **✅ Expected Results:**
- Window 2 shows: "New Resources Added" toast **within 1 second**
- Both windows: Resource appears in list immediately
- Both windows: Can download the new resource

### **❌ If Not Working:**
```bash
# Check backend console:
grep "resource_uploaded" logs/app-*.log

# Check browser console (F12):
# Should see: "📤 Resource uploaded event received"
```

---

## 🔍 **QUICK DEBUGGING**

### **Socket Connection Check**

#### **Backend:**
```bash
# In terminal running backend:
# Should see:
✅ Socket.IO initialized successfully
🔌 Socket connected: [socket-id]
```

#### **Frontend:**
```javascript
// In browser console (F12):
socketService.getSocket().then(s => console.log("Connected:", s.connected))
// Should print: Connected: true
```

---

### **Network Tab Verification**

1. Open DevTools (F12) → Network tab
2. Filter: **WS** (WebSocket)
3. Should see: `ws://localhost:5000/socket.io/?EIO=4&transport=websocket`
4. Status should be: **101 Switching Protocols** (green)
5. Click on it → Messages tab → Should see ping/pong heartbeats

---

## 📊 **Performance Check**

### **Latency Test:**

Use browser console to measure:

```javascript
// In Window 2 (Attendee), run this before host ends webinar:
const startTime = Date.now();
socketService.getSocket().then(socket => {
  socket.once('webinar_ended', () => {
    console.log(`⚡ Received in ${Date.now() - startTime}ms`);
  });
});

// Then host ends webinar in Window 1
// Should see: ⚡ Received in 50-150ms
```

**Target:** < 200ms latency

---

## 🎬 **End-to-End Test Scenario**

### **Complete User Journey (5 minutes):**

1. **Create Webinar** (Host)
   - Set certification: ON
   - Upload thumbnail
   - Add description

2. **Enroll** (Attendee)
   - Enroll in webinar
   - Navigate to webinar details

3. **Upload Resources** (Host)
   - Upload 2 PDF files
   - **Verify:** Attendee sees them **immediately**

4. **End Webinar** (Host)
   - Click "End Webinar"
   - **Verify:** Attendee sees "Webinar Ended" **immediately**

5. **Certificate** (Attendee)
   - **Verify:** Certificate section appears
   - Click "Request Certificate" (if auto-generation not triggered)
   - Download certificate

**✅ All should happen in real-time with < 1 second delay**

---

## 🚨 **Common Issues & Fixes**

### **Issue 1: "Socket not connected"**

**Symptoms:**
- No real-time updates
- Browser console shows: `Socket disconnected`

**Fix:**
```bash
# 1. Check backend is running on correct port
lsof -i :5000  # Should show node process

# 2. Check CORS settings
# File: webinar_be/src/index.ts
# Verify: CLIENT_URL matches frontend URL

# 3. Restart both servers
cd webinar_be && npm run dev
cd webinar_fe && npm run dev
```

---

### **Issue 2: "Events not received"**

**Symptoms:**
- Socket connected but no events received

**Check:**
```javascript
// Browser console:
socketService.getSocket().then(socket => {
  console.log("Socket rooms:", socket.rooms);
  // Should include: webinar_{webinarId}
});
```

**Fix:**
- Verify user is on webinar details page
- Check webinarId is correct
- Reload page to re-join room

---

### **Issue 3: "Delayed updates (> 1 second)"**

**Possible Causes:**
1. Using polling instead of WebSocket
2. Network latency
3. Server overload

**Fix:**
```javascript
// Check transport method:
socketService.getSocket().then(socket => {
  console.log("Transport:", socket.io.engine.transport.name);
  // Should be: "websocket", not "polling"
});
```

If it says "polling":
1. Check firewall settings
2. Verify WebSocket support in proxy (if any)
3. Check browser compatibility

---

## 📋 **Testing Checklist**

Before deploying to production:

- [ ] Test 1: Webinar End ✅
  - [ ] Host sees immediate success
  - [ ] Attendees see notification < 1 second
  - [ ] Status updates in all windows
  - [ ] Certificate section appears (if enabled)

- [ ] Test 2: Resource Upload ✅
  - [ ] Upload completes successfully
  - [ ] Attendees see new resource < 1 second
  - [ ] Can download resource immediately
  - [ ] Toast notification appears

- [ ] Test 3: Resource Delete ✅
  - [ ] Delete completes successfully
  - [ ] Attendees see removal < 1 second
  - [ ] Toast notification appears

- [ ] Performance ✅
  - [ ] Latency < 200ms
  - [ ] WebSocket transport (not polling)
  - [ ] No memory leaks

- [ ] Error Handling ✅
  - [ ] Backend errors don't crash API
  - [ ] Frontend handles disconnection gracefully
  - [ ] Automatic reconnection works

---

## 🎯 **Quick Status Check**

### **Backend Status:**
```bash
# Terminal running backend should show:
✅ Socket.IO initialized successfully
✅ Connected to MongoDB
🚀 Server running on port 5000
```

### **Frontend Status:**
```bash
# Terminal running frontend should show:
  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

### **Browser Console:**
```javascript
// Should NOT see:
❌ Socket connection failed
❌ WebSocket handshake failed

// Should see:
✅ Socket connected successfully
✅ JWT token valid
```

---

## ✅ **Success Indicators**

### **You know it's working when:**

1. ✅ **Instant Updates:** Changes appear in < 1 second
2. ✅ **No Page Refresh:** Updates happen without reload
3. ✅ **Toast Notifications:** Events show user-friendly messages
4. ✅ **Console Logs:** Both backend and frontend log events
5. ✅ **WebSocket Status:** Network tab shows active WS connection

---

## 🎉 **Expected Results Summary**

| Action | Window 1 (Actor) | Window 2 (Observer) | Latency |
|--------|------------------|---------------------|---------|
| End Webinar | Success toast | "Webinar Ended" toast | < 150ms |
| Upload Resource | Upload progress | "New Resources" toast | < 200ms |
| Delete Resource | Success toast | "Resource Removed" toast | < 150ms |

---

## 📞 **Still Having Issues?**

1. **Check logs:**
   ```bash
   # Backend logs
   tail -f webinar_be/logs/app-*.log
   
   # Look for:
   ✅ Socket event emitted
   ❌ Socket error
   ```

2. **Verify socket instance:**
   ```bash
   # Backend console should show:
   setSocketInstance: Socket.IO instance set successfully
   ```

3. **Test health endpoint:**
   ```bash
   curl http://localhost:5000/api/health
   # Should return: {"status": "OK", ...}
   ```

4. **Restart everything:**
   ```bash
   # Kill all node processes
   pkill node
   
   # Restart backend
   cd webinar_be && npm run dev
   
   # Restart frontend
   cd webinar_fe && npm run dev
   ```

---

## 🚀 **Production Deployment Checklist**

Before going live:

- [ ] Test with 10+ concurrent users
- [ ] Test with slow network (throttle to 3G in DevTools)
- [ ] Test reconnection after network drop
- [ ] Verify WebSocket works through production proxy/CDN
- [ ] Check CORS settings for production domains
- [ ] Monitor socket connection count
- [ ] Set up error logging (Sentry, LogRocket, etc.)

---

**Testing Time:** 5-10 minutes  
**Difficulty:** Easy  
**Status:** ✅ Ready to Test

**Both features are production-ready and just need verification!** 🎉

