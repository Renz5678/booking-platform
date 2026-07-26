export default function CrisisBanner() {
  return (
    <div className="bg-on-tertiary-container text-primary font-label-md py-3 px-margin-mobile md:px-margin-desktop sticky top-0 z-50 flex flex-col sm:flex-row justify-between items-center text-center sm:text-left shadow-sm">
      <p>In immediate danger? Call the National Mental Health Crisis Hotline.</p>
      <button className="mt-2 sm:mt-0 bg-primary text-on-primary px-4 py-2 rounded-full font-label-sm hover:opacity-90 transition-opacity">
        Help Now (1553)
      </button>
    </div>
  );
}
