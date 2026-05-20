export const calculateFreelancerScore = (freelancer) => {

  let score = 0;

  // Rating (0-5)
  score += (freelancer.rating || 0) * 20;

  // Job success rate
  score += (freelancer.jobSuccessRate || 0) * 0.2;

  // Earnings
  score += Math.min((freelancer.totalEarnings || 0) / 1000, 20);

  // Completed jobs
  score += (freelancer.totalJobs || freelancer.completedJobs || 0) * 2;

  // Response rate
  score += (freelancer.responseRate || 0) * 10;

  // Recent activity
  if (
    freelancer.lastActive &&
    Date.now() - new Date(freelancer.lastActive) < 7 * 24 * 60 * 60 * 1000
  ) {
    score += 10;
  }

  return score;
};

export const rankFreelancers = (freelancers) => {

  return freelancers
    .map((freelancer) => {
      const base =
        freelancer && typeof freelancer.toObject === 'function'
          ? freelancer.toObject()
          : freelancer;

      return {
        ...base,
        rankScore: calculateFreelancerScore(base || {})
      };
    })
    .sort((a, b) => b.rankScore - a.rankScore);

};