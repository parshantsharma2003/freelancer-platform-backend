import Job from "../models/Job.js";
import redis from "../config/redis.js";

/**
 * Calculate match score between freelancer and job
 */
const calculateJobScore = (freelancer, job) => {
  let score = 0;

  // Skill match
  const matchedSkills = job.skills.filter(skill =>
    freelancer.skills?.includes(skill)
  );

  score += matchedSkills.length * 10;

  // Experience level match
  if (freelancer.experienceLevel === job.experienceLevel) {
    score += 20;
  }

  // Category match
  if (freelancer.category === job.category) {
    score += 15;
  }

  // Budget match
  if (job.budget?.amount && freelancer.hourlyRate) {
    if (job.budget.amount >= freelancer.hourlyRate) {
      score += 10;
    }
  }

  // Activity boost
  if (
    freelancer.lastActive &&
    Date.now() - new Date(freelancer.lastActive) < 7 * 24 * 60 * 60 * 1000
  ) {
    score += 5;
  }

  return score;
};

/**
 * Get recommended jobs for freelancer
 */
export const getRecommendedJobs = async (freelancer) => {
  const cacheKey = `recommended_jobs_${freelancer._id}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch {
    // Continue without cache when Redis is unavailable.
  }

  const jobs = await Job.find({
    status: "open",
    isPublished: true
  }).limit(100);

  const scoredJobs = jobs.map(job => {
    const score = calculateJobScore(freelancer, job);
    return { job, score };
  });

  const recommendations = scoredJobs
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(item => item.job);

  try {
    await redis.set(cacheKey, JSON.stringify(recommendations), "EX", 300);
  } catch {
    // Cache write is best-effort.
  }

  return recommendations;
};