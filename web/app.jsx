// Root: pick desktop layout or mobile bottom-sheet layout based on viewport.

(function () {
  const { useState, useEffect } = React;

  const MOBILE_QUERY = '(max-width: 768px)';

  function App() {
    const [isMobile, setIsMobile] = useState(
      typeof window !== 'undefined' && window.matchMedia(MOBILE_QUERY).matches
    );

    useEffect(() => {
      const mq = window.matchMedia(MOBILE_QUERY);
      const onChange = (e) => setIsMobile(e.matches);
      if (mq.addEventListener) mq.addEventListener('change', onChange);
      else mq.addListener(onChange);
      return () => {
        if (mq.removeEventListener) mq.removeEventListener('change', onChange);
        else mq.removeListener(onChange);
      };
    }, []);

    return isMobile
      ? <window.PartiuMobile />
      : <window.PartiuCoastal />;
  }

  ReactDOM.createRoot(document.getElementById('root')).render(<App />);
})();
