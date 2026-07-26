import re

file_path = "/home/scarecrow/dev/booking_system/frontend-landing/src/app/counselors/page.tsx"
with open(file_path, "r") as f:
    content = f.read()

# 1. Update State types
content = content.replace(
    'const [availableWeeklySlots, setAvailableWeeklySlots] = useState<Record<string, string[]>>({});',
    'const [availableWeeklySlots, setAvailableWeeklySlots] = useState<Record<string, { available: string[], occupied: string[] }>>({});\n  const [dragSelection, setDragSelection] = useState<{ dateStr: string, startHour: number, endHour: number } | null>(null);\n  const [selectedTimeRange, setSelectedTimeRange] = useState<{ dateStr: string, startTime: string, endTime: string, slotsCount: number } | null>(null);'
)

# 2. Remove selectedTime
content = content.replace(
    'const [selectedTime, setSelectedTime] = useState<string>("");',
    '// selectedTime removed in favor of selectedTimeRange'
)

# 3. Update reset logic in openBookingModal
content = content.replace(
    'setSelectedTime("");',
    'setSelectedTimeRange(null);\n    setDragSelection(null);'
)
content = content.replace(
    'setSelectedTime(""); setBookingStep(1);',
    'setSelectedTimeRange(null); setBookingStep(1);'
)

# 4. Update fetch logic default empty
content = content.replace(
    'setAvailableWeeklySlots(data || {});',
    'setAvailableWeeklySlots(data || {});' # No change needed here, data is the dict
)

# 5. Update handleBookSession
content = content.replace(
    'if (!selectedCounselor || !selectedTime) return;',
    'if (!selectedCounselor || !selectedTimeRange) return;'
)
content = content.replace(
    'const start = new Date(selectedTime);\n    const end = new Date(start.getTime() + duration * 60000);',
    'const start = new Date(selectedTimeRange.startTime);\n    const end = new Date(selectedTimeRange.endTime);'
)

# 6. Update Step 3 Display
content = content.replace(
    '<span className="font-label-md text-primary font-medium">{new Date(selectedTime).toLocaleString([], { dateStyle: \'medium\', timeStyle: \'short\' })}</span>',
    '<span className="font-label-md text-primary font-medium">{new Date(selectedTimeRange.startTime).toLocaleString([], { dateStyle: \'medium\', timeStyle: \'short\' })} - {new Date(selectedTimeRange.endTime).toLocaleString([], { timeStyle: \'short\' })}</span>'
)
content = content.replace(
    '<span className="font-label-md text-primary font-medium">{duration} mins</span>',
    '<span className="font-label-md text-primary font-medium">{selectedTimeRange.slotsCount} hr(s)</span>'
)

# 7. Update grid JSX
# Find the <div className="grid grid-cols-8 gap-2 mb-2 text-center border-b border-outline-variant pb-2"> ... up to Step 3
old_grid = '''<div className="grid grid-cols-8 gap-2">
                          {["8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM"].map((time, timeIndex) => (
                            <React.Fragment key={time}>
                              <div className="font-label-sm text-[12px] font-semibold text-on-surface-variant text-right pr-2 py-1 flex items-center justify-end">
                                {time}
                              </div>
                              {Array.from({length: 7}).map((_, dayIndex) => {
                                const d = new Date(currentWeekStart);
                                d.setDate(d.getDate() + dayIndex);
                                const dateStr = d.toISOString().split('T')[0];
                                
                                const startHour = 8 + timeIndex;
                                const slotTimeIsoStr = `${dateStr}T${startHour.toString().padStart(2, '0')}:00:00Z`;
                                
                                // Check if this time matches any available slot fetched
                                // Note: our slots are returned as exact UTC strings, so we need to match them properly
                                // For MVP simplicity, we check if there's any slot in availableWeeklySlots[dateStr] that starts within this hour
                                const slotsForDay = availableWeeklySlots[dateStr] || [];
                                
                                const matchedSlot = slotsForDay.find(slotStr => {
                                  const slotD = new Date(slotStr);
                                  return slotD.getUTCHours() === startHour;
                                });

                                const isPast = new Date(slotTimeIsoStr) < new Date();

                                if (matchedSlot && !isPast) {
                                  return (
                                    <button
                                      key={`${dayIndex}-${timeIndex}`}
                                      onClick={() => {
                                        setSelectedTime(matchedSlot);
                                        setBookingStep(3);
                                      }}
                                      className="rounded h-8 bg-secondary-container border-l-4 border-secondary hover:bg-[#65de7e] transition-colors cursor-pointer text-[10px] font-bold text-on-secondary-container flex items-center justify-center shadow-sm"
                                    >
                                      Book
                                    </button>
                                  );
                                } else {
                                  return (
                                    <div
                                      key={`${dayIndex}-${timeIndex}`}
                                      className="rounded h-8 bg-surface-container border border-dashed border-outline-variant/50 flex items-center justify-center opacity-50"
                                    >
                                    </div>
                                  );
                                }
                              })}
                            </React.Fragment>
                          ))}
                        </div>'''

new_grid = '''<div 
                          className="grid grid-cols-8 gap-x-2 gap-y-0"
                          onMouseUp={() => {
                            if (dragSelection) {
                              const minHour = Math.min(dragSelection.startHour, dragSelection.endHour);
                              const maxHour = Math.max(dragSelection.startHour, dragSelection.endHour);
                              
                              const slotsForDay = availableWeeklySlots[dragSelection.dateStr]?.available || [];
                              let allAvailable = true;
                              for (let h = minHour; h <= maxHour; h++) {
                                const hasSlot = slotsForDay.some(slotStr => new Date(slotStr).getUTCHours() === h);
                                if (!hasSlot) { allAvailable = false; break; }
                              }
                              
                              if (allAvailable) {
                                const startD = new Date(`${dragSelection.dateStr}T${minHour.toString().padStart(2, '0')}:00:00Z`);
                                const endD = new Date(`${dragSelection.dateStr}T${(maxHour + 1).toString().padStart(2, '0')}:00:00Z`);
                                setSelectedTimeRange({
                                  dateStr: dragSelection.dateStr,
                                  startTime: startD.toISOString(),
                                  endTime: endD.toISOString(),
                                  slotsCount: (maxHour - minHour) + 1
                                });
                                setBookingStep(3);
                              }
                              setDragSelection(null);
                            }
                          }}
                          onMouseLeave={() => setDragSelection(null)}
                        >
                          {["8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM"].map((time, timeIndex) => (
                            <React.Fragment key={time}>
                              <div className="font-label-sm text-[12px] font-semibold text-on-surface-variant text-right pr-2 py-1 flex items-center justify-end h-10">
                                {time}
                              </div>
                              {Array.from({length: 7}).map((_, dayIndex) => {
                                const d = new Date(currentWeekStart);
                                d.setDate(d.getDate() + dayIndex);
                                const dateStr = d.toISOString().split('T')[0];
                                
                                const startHour = 8 + timeIndex;
                                const slotTimeIsoStr = `${dateStr}T${startHour.toString().padStart(2, '0')}:00:00Z`;
                                
                                const slotsForDay = availableWeeklySlots[dateStr] || { available: [], occupied: [] };
                                
                                const isAvailable = slotsForDay.available?.some(slotStr => new Date(slotStr).getUTCHours() === startHour);
                                const isOccupied = slotsForDay.occupied?.some(slotStr => new Date(slotStr).getUTCHours() === startHour);
                                
                                const isPast = new Date(slotTimeIsoStr) < new Date();

                                const isSelected = dragSelection && 
                                  dragSelection.dateStr === dateStr && 
                                  startHour >= Math.min(dragSelection.startHour, dragSelection.endHour) && 
                                  startHour <= Math.max(dragSelection.startHour, dragSelection.endHour);

                                if (isOccupied && !isPast) {
                                  return (
                                    <div
                                      key={`${dayIndex}-${timeIndex}`}
                                      className="h-10 bg-error-container border-error text-error flex items-center justify-center text-[10px] font-bold shadow-sm"
                                    >
                                      (Occupied)
                                    </div>
                                  );
                                } else if (isAvailable && !isPast) {
                                  return (
                                    <div
                                      key={`${dayIndex}-${timeIndex}`}
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        setDragSelection({ dateStr, startHour, endHour: startHour });
                                      }}
                                      onMouseEnter={() => {
                                        if (dragSelection && dragSelection.dateStr === dateStr) {
                                          setDragSelection({ ...dragSelection, endHour: startHour });
                                        }
                                      }}
                                      className={`h-10 transition-colors cursor-pointer text-[10px] font-bold flex items-center justify-center select-none shadow-sm ${isSelected ? 'bg-primary text-on-primary' : 'bg-secondary-container text-on-secondary-container hover:bg-[#65de7e]'}`}
                                    >
                                      {isSelected ? 'Selected' : 'Available'}
                                    </div>
                                  );
                                } else {
                                  return (
                                    <div
                                      key={`${dayIndex}-${timeIndex}`}
                                      className="h-10 bg-surface-container border-x border-dashed border-outline-variant/50 flex items-center justify-center opacity-50"
                                    >
                                    </div>
                                  );
                                }
                              })}
                            </React.Fragment>
                          ))}
                        </div>'''

content = content.replace(old_grid, new_grid)

with open(file_path, "w") as f:
    f.write(content)

print("Patched successfully")
