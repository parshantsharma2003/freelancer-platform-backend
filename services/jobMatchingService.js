export const calculateMatchScore = (job, freelancer) => {

  let score = 0;
  const jobSkills = Array.isArray(job?.skills) ? job.skills : [];
  const freelancerSkills = Array.isArray(freelancer?.skills) ? freelancer.skills : [];

  const matchedSkills = jobSkills.filter(skill =>
    freelancerSkills.includes(skill)
  );

  score += matchedSkills.length * 10;

  if (freelancer?.category && job?.category && freelancer.category === job.category) {
    score += 20;
  }

  if (freelancer?.experienceLevel && job?.experienceLevel && freelancer.experienceLevel === job.experienceLevel) {
    score += 20;
  }

  score += (freelancer.rating || 0) * 5;

  if (
    freelancer.lastActive &&
    Date.now() - new Date(freelancer.lastActive) < 3 * 24 * 60 * 60 * 1000
  ) {
    score += 10;
  }

  return score;
};


export const findBestFreelancers = (job, freelancers) => {

  return freelancers
    .map(f => ({
      freelancer: f,
      matchScore: calculateMatchScore(job, f)
    }))
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 10);

};