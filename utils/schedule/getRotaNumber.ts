const getRotaNumberForDate = (inputDate: Date = new Date()): 1 | 2 | 3 => {
  // Reference date for Rota 3
  const referenceDate = new Date('2025-10-06T00:00:00+08:00');

  // Cycle order array maps index to rota number (Day 0 = Rota 3)
  const rotaCycle: (1 | 2 | 3)[] = [3, 2, 1];

  // Calculate difference in milliseconds
  const diffTime = inputDate.getTime() - referenceDate.getTime();

  // Calculate day difference
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  // Get modulo index handling negatives
  const idx = ((diffDays % 3) + 3) % 3;

  return rotaCycle[idx];
};

export default getRotaNumberForDate;
