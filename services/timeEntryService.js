import TimeEntry from '../models/TimeEntry.js';
import Contract from '../models/Contract.js';
import User from '../models/User.js';

// Helper: Get start of week (Monday) for a given date
export function getWeekStartDate(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

// Helper: Get end of week (Sunday) for a given date
export function getWeekEndDate(date = new Date()) {
  const start = getWeekStartDate(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

// Helper: Calculate duration in minutes between two dates
function calculateDurationInMinutes(startTime, endTime) {
  return Math.floor((endTime - startTime) / (1000 * 60));
}

// Helper: Convert minutes to hours
function minutesToHours(minutes) {
  return minutes / 60;
}

// Start a time entry
export async function startTimeEntry(contractId, freelancerId, hourlyRate, description = '') {
  // Verify contract exists and user is freelancer
  const contract = await Contract.findById(contractId);
  if (!contract) {
    throw new Error('Contract not found');
  }

  if (contract.freelancer.toString() !== freelancerId.toString()) {
    throw new Error('Only freelancer can start time entries');
  }

  // Verify contract is hourly type
  if (contract.budget.type !== 'hourly') {
    throw new Error('Time tracking only available for hourly contracts');
  }

  // Verify contract is active
  if (contract.status !== 'active') {
    throw new Error(`Cannot track time on ${contract.status} contract`);
  }

  // Check for active time entries (prevent multiple concurrent entries)
  const activeEntry = await TimeEntry.findOne({
    contract: contractId,
    freelancer: freelancerId,
    status: 'active'
  });

  if (activeEntry) {
    throw new Error('You already have an active time entry. Stop it before starting a new one.');
  }

  // Create time entry
  const weekStart = getWeekStartDate();
  const timeEntry = await TimeEntry.create({
    contract: contractId,
    freelancer: freelancerId,
    client: contract.client,
    startTime: new Date(),
    hourlyRate: hourlyRate || contract.budget.hourlyRate,
    description,
    status: 'active',
    weekStartDate: weekStart,
    weekEndDate: getWeekEndDate(weekStart)
  });

  return timeEntry;
}

// Stop a time entry
export async function stopTimeEntry(timeEntryId, freelancerId) {
  const timeEntry = await TimeEntry.findById(timeEntryId);
  
  if (!timeEntry) {
    throw new Error('Time entry not found');
  }

  if (timeEntry.freelancer.toString() !== freelancerId.toString()) {
    throw new Error('Only the freelancer who started this entry can stop it');
  }

  if (timeEntry.status !== 'active' && timeEntry.status !== 'paused') {
    throw new Error(`Cannot stop a ${timeEntry.status} time entry`);
  }

  // Calculate duration and billable amount
  const endTime = new Date();
  timeEntry.endTime = endTime;
  
  // Calculate total paused duration
  const totalPausedMinutes = timeEntry.pauses.reduce((sum, p) => sum + (p.durationPaused || 0), 0);
  
  // Calculate actual working duration
  const totalMinutes = calculateDurationInMinutes(timeEntry.startTime, endTime);
  timeEntry.duration = totalMinutes - totalPausedMinutes;
  
  // Calculate billable amount
  const durationInHours = minutesToHours(timeEntry.duration);
  timeEntry.billableAmount = durationInHours * timeEntry.hourlyRate;
  
  // Calculate platform fee and net amount
  const feeAmount = (timeEntry.billableAmount * timeEntry.platformFeePercent) / 100;
  timeEntry.platformFee = Math.round(feeAmount * 100) / 100;
  timeEntry.netAmount = Math.round((timeEntry.billableAmount - timeEntry.platformFee) * 100) / 100;
  
  timeEntry.status = 'stopped';

  await timeEntry.save();

  // Update contract time tracking
  const contract = await Contract.findById(timeEntry.contract);
  contract.timeTracking.totalHours += durationInHours;
  contract.timeTracking.pendingHours += durationInHours;
  await contract.save();

  return timeEntry;
}

// Pause a time entry
export async function pauseTimeEntry(timeEntryId, freelancerId) {
  const timeEntry = await TimeEntry.findById(timeEntryId);
  
  if (!timeEntry) {
    throw new Error('Time entry not found');
  }

  if (timeEntry.freelancer.toString() !== freelancerId.toString()) {
    throw new Error('Only the freelancer can pause this entry');
  }

  if (timeEntry.status !== 'active') {
    throw new Error('Can only pause an active time entry');
  }

  timeEntry.status = 'paused';
  timeEntry.pauses.push({
    pausedAt: new Date()
  });

  await timeEntry.save();
  return timeEntry;
}

// Resume a time entry
export async function resumeTimeEntry(timeEntryId, freelancerId) {
  const timeEntry = await TimeEntry.findById(timeEntryId);
  
  if (!timeEntry) {
    throw new Error('Time entry not found');
  }

  if (timeEntry.freelancer.toString() !== freelancerId.toString()) {
    throw new Error('Only the freelancer can resume this entry');
  }

  if (timeEntry.status !== 'paused') {
    throw new Error('Can only resume a paused time entry');
  }

  // Find the last pause and calculate duration
  if (timeEntry.pauses.length > 0) {
    const lastPause = timeEntry.pauses[timeEntry.pauses.length - 1];
    if (lastPause.pausedAt && !lastPause.resumedAt) {
      const pauseMinutes = calculateDurationInMinutes(lastPause.pausedAt, new Date());
      lastPause.durationPaused = pauseMinutes;
      lastPause.resumedAt = new Date();
    }
  }

  timeEntry.status = 'active';
  await timeEntry.save();
  return timeEntry;
}

// Check weekly hour limit
export async function checkWeeklyHourLimit(contractId, freelancerId) {
  const contract = await Contract.findById(contractId);
  
  if (!contract) {
    throw new Error('Contract not found');
  }

  const weeklyLimit = contract.budget.weeklyHourLimit || 40;
  const currentWeekHours = contract.timeTracking.currentWeekHours || 0;
  
  return {
    currentWeekHours,
    weeklyLimit,
    hoursRemaining: weeklyLimit - currentWeekHours,
    limitExceeded: currentWeekHours >= weeklyLimit
  };
}

// Approve time entry (client only)
export async function approveTimeEntry(timeEntryId, clientId) {
  const timeEntry = await TimeEntry.findById(timeEntryId)
    .populate('contract');

  if (!timeEntry) {
    throw new Error('Time entry not found');
  }

  if (timeEntry.client.toString() !== clientId.toString()) {
    throw new Error('Only client can approve time entries');
  }

  if (timeEntry.status !== 'stopped' && timeEntry.status !== 'submitted') {
    throw new Error('Can only approve submitted or stopped entries');
  }

  const contract = await Contract.findById(timeEntry.contract);

  // Check weekly hour limit
  const weeklyLimit = contract.budget.weeklyHourLimit || 40;
  const currentWeekHours = contract.timeTracking.currentWeekHours || 0;
  const durationInHours = minutesToHours(timeEntry.duration);

  if (currentWeekHours + durationInHours > weeklyLimit) {
    throw new Error(`Approving this entry would exceed weekly limit of ${weeklyLimit} hours`);
  }

  // Mark as approved
  timeEntry.approved = true;
  timeEntry.approvedAt = new Date();
  timeEntry.approvedBy = clientId;
  timeEntry.status = 'approved';

  await timeEntry.save();

  // Update contract tracking
  contract.timeTracking.approvedHours += durationInHours;
  contract.timeTracking.pendingHours = Math.max(0, contract.timeTracking.pendingHours - durationInHours);
  contract.timeTracking.currentWeekHours += durationInHours;
  contract.timeTracking.totalEarnings += timeEntry.billableAmount;
  await contract.save();

  return timeEntry;
}

// Reject time entry (client only)
export async function rejectTimeEntry(timeEntryId, clientId, reason = '') {
  const timeEntry = await TimeEntry.findById(timeEntryId);

  if (!timeEntry) {
    throw new Error('Time entry not found');
  }

  if (timeEntry.client.toString() !== clientId.toString()) {
    throw new Error('Only client can reject time entries');
  }

  if (timeEntry.status !== 'stopped' && timeEntry.status !== 'submitted') {
    throw new Error('Can only reject submitted or stopped entries');
  }

  timeEntry.status = 'rejected';
  timeEntry.description = reason;
  await timeEntry.save();

  return timeEntry;
}

// Get time entries for a contract
export async function getTimeEntriesForContract(contractId, userId, role) {
  let query = TimeEntry.find({ contract: contractId });

  // If freelancer, can only see own entries
  if (role === 'freelancer') {
    query = query.where('freelancer').equals(userId);
  }

  return await query
    .populate('freelancer', 'firstName lastName')
    .populate('approvedBy', 'firstName lastName')
    .sort({ startTime: -1 });
}

// Get weekly time entries
export async function getWeeklyTimeEntries(contractId, userId, role, weekStartDate) {
  const weekStart = getWeekStartDate(weekStartDate);
  const weekEnd = getWeekEndDate(weekStartDate);

  let query = TimeEntry.find({
    contract: contractId,
    startTime: {
      $gte: weekStart,
      $lte: weekEnd
    }
  });

  if (role === 'freelancer') {
    query = query.where('freelancer').equals(userId);
  }

  const entries = await query
    .populate('freelancer', 'firstName lastName')
    .populate('approvedBy', 'firstName lastName')
    .sort({ startTime: 1 });

  // Calculate weekly stats
  const stats = {
    weekStart,
    weekEnd,
    totalHours: 0,
    approvedHours: 0,
    rejectedHours: 0,
    pendingHours: 0,
    totalBillableAmount: 0,
    approvedAmount: 0,
    entries
  };

  entries.forEach(entry => {
    const hours = minutesToHours(entry.duration);
    stats.totalHours += hours;

    if (entry.status === 'approved') {
      stats.approvedHours += hours;
      stats.approvedAmount += entry.billableAmount;
    } else if (entry.status === 'rejected') {
      stats.rejectedHours += hours;
    } else {
      stats.pendingHours += hours;
    }

    stats.totalBillableAmount += entry.billableAmount;
  });

  return stats;
}

// Generate weekly invoice
export async function generateWeeklyInvoice(contractId, weekStartDate) {
  const weeklyStats = await getWeeklyTimeEntries(contractId, null, 'admin', weekStartDate);
  const contract = await Contract.findById(contractId)
    .populate('client', 'firstName lastName email')
    .populate('freelancer', 'firstName lastName email');

  return {
    contract: {
      id: contract._id,
      title: contract.title
    },
    client: {
      id: contract.client._id,
      name: `${contract.client.firstName} ${contract.client.lastName}`,
      email: contract.client.email
    },
    freelancer: {
      id: contract.freelancer._id,
      name: `${contract.freelancer.firstName} ${contract.freelancer.lastName}`,
      email: contract.freelancer.email
    },
    week: weeklyStats,
    invoiceDate: new Date(),
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Due in 7 days
    hourlyRate: contract.budget.hourlyRate,
    platformFeePercent: parseFloat(process.env.PLATFORM_FEE_PERCENT || '10') // Platform fee from env, default 10%
  };
}

// Process weekly payment (client balance auto-pay)
export async function processWeeklyPayment(contractId, weekStartDate) {
  const weeklyStats = await getWeeklyTimeEntries(contractId, null, 'admin', weekStartDate);
  const contract = await Contract.findById(contractId);
  const client = await User.findById(contract.client);

  if (!client || client.balance < weeklyStats.approvedAmount) {
    throw new Error('Insufficient client balance for payment');
  }

  // Deduct from client balance
  client.balance -= weeklyStats.approvedAmount;
  await client.save();

  // Add to freelancer earnings
  const freelancer = await User.findById(contract.freelancer);
  freelancer.balance += weeklyStats.approvedAmount;
  await freelancer.save();

  // Update contract
  contract.totalPaid += weeklyStats.approvedAmount;
  contract.timeTracking.totalEarnings = weeklyStats.approvedAmount;
  await contract.save();

  return {
    contract: contract._id,
    weekStart: weeklyStats.weekStart,
    weekEnd: weeklyStats.weekEnd,
    hours: weeklyStats.approvedHours,
    amount: weeklyStats.approvedAmount,
    clientBalance: client.balance,
    freelancerBalance: freelancer.balance,
    date: new Date()
  };
}

// Get current active time entry
export async function getCurrentActiveTimeEntry(contractId, freelancerId) {
  return await TimeEntry.findOne({
    contract: contractId,
    freelancer: freelancerId,
    status: 'active'
  }).populate('contract', 'title budget');
}

// Get time entry by ID
export async function getTimeEntryById(timeEntryId) {
  return await TimeEntry.findById(timeEntryId)
    .populate('contract', 'title budget')
    .populate('freelancer', 'firstName lastName email')
    .populate('client', 'firstName lastName email')
    .populate('approvedBy', 'firstName lastName email');
}
