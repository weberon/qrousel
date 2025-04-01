import React, { useState, useEffect, useRef } from 'react'; // Removed act import
import QRCode from 'qrcode';
import { marked } from 'marked';
import yaml from 'js-yaml';
import './QrCodeCarousel.css';

function QrCodeCarousel() {
  const [qrdata, setQrdata] = useState([]);
  const [qrCodes, setQrCodes] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [descriptionHtml, setDescriptionHtml] = useState(null);
  const [descriptionHeight, setDescriptionHeight] = useState(0);
  const [error, setError] = useState(null);
  const [isFsApiAvailable, setIsFsApiAvailable] = useState(false); // New state
  const carouselRef = useRef(null);

  useEffect(() => {
    // Check if File System Access API is available
    setIsFsApiAvailable('showOpenFilePicker' in window);
  }, []);

  const loadQrdataFromFile = async () => {
    try {
      if (isFsApiAvailable) {
        const [fileHandle] = await window.showOpenFilePicker({
          types: [
            {
              description: 'YAML Files',
              accept: { 'application/x-yaml': ['.yaml', '.yml'] },
            },
          ],
        });
        const file = await fileHandle.getFile();
        const yamlText = await file.text();
        const parsedQrdata = yaml.load(yamlText);
        setQrdata(parsedQrdata || []);
        localStorage.setItem('QrData', JSON.stringify(parsedQrdata)); // Save to localStorage
        setError(null);
      } else {
        console.error("File System Access API is not available.");
      }
    } catch (error) {
      console.error('Error loading qrdata.yaml:', error);
      setError(error.message || "An unknown error occurred"); // Ensure error is a string
    }
  };

  const loadQrdataFromInput = () => {
    // Trigger file input for fallback
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.yaml,.yml,.txt'; // Allow .txt files
    fileInput.addEventListener('change', (event) => {
      const file = event.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const parsedQrdata = yaml.load(e.target.result);
            setQrdata(parsedQrdata || []);
            localStorage.setItem('QrData', JSON.stringify(parsedQrdata)); // Save to localStorage
            setError(null);
          } catch (error) {
            console.error('Error parsing file content:', error);
            setError(error.message || "An unknown error occurred"); // Ensure error is a string
          }
        };
        reader.readAsText(file);
      }
    });
    fileInput.click();
  };

  useEffect(() => {
    const savedQrdata = localStorage.getItem('QrData');
    if (savedQrdata) {
      try {
        setQrdata(JSON.parse(savedQrdata));
      } catch (e) {
        setError("Invalid data in localStorage"); // Ensure error is a string
        localStorage.removeItem('QrData');
      }
    }
  }, []);

  useEffect(() => {
    const generateQRCodes = async () => {
      if (Array.isArray(qrdata) && qrdata.length > 0) {
        const codes = await Promise.all(
          qrdata.map(async (qrdata) => {
            try {
              return await QRCode.toDataURL(qrdata.url, { width: 200 });
            } catch (error) {
              console.error(`Error generating QR code for ${qrdata.url}:`, error);
              return '/placeholder.png';
            }
          })
        );
        setQrCodes(codes); // Directly update state without act
      }
    };

    generateQRCodes();
  }, [qrdata]);

  useEffect(() => {
    if (qrCodes.length > 0) {
      let maxHeight = 0;
      qrdata.forEach((qrdata) => {
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = marked.parse(qrdata.description || '');
        if (typeof window !== 'undefined' && document) {
          document.body.appendChild(tempDiv);
          maxHeight = Math.max(maxHeight, tempDiv.offsetHeight);
          document.body.removeChild(tempDiv);
        }
        else {
          maxHeight = 200; // set a default height for node
        }
      });
      setDescriptionHeight(maxHeight);
    }
  }, [qrCodes, qrdata]);

  useEffect(() => {
    setDescriptionHtml(null);
    if (qrdata[currentIndex]?.description) {
      setDescriptionHtml(marked.parse(qrdata[currentIndex].description));
    }
  }, [currentIndex, qrdata]);

  useEffect(() => {
    let touchStartX = 0;
    let touchEndX = 0;

    const handleTouchStart = (e) => {
      touchStartX = e.changedTouches[0].screenX;
    };

    const handleTouchEnd = (e) => {
      touchEndX = e.changedTouches[0].screenX;
      if (touchStartX - touchEndX > 50) {
        showSlide(currentIndex + 1); // Swipe left
      } else if (touchEndX - touchStartX > 50) {
        showSlide(currentIndex - 1); // Swipe right
      }
    };

    const carouselElement = carouselRef.current;
    if (carouselElement && typeof window !== 'undefined') { // Only attach listeners in a browser
      carouselElement.addEventListener('touchstart', handleTouchStart);
      carouselElement.addEventListener('touchend', handleTouchEnd);
    }

    return () => {
      if (carouselElement && typeof window !== 'undefined') {
        carouselElement.removeEventListener('touchstart', handleTouchStart);
        carouselElement.removeEventListener('touchend', handleTouchEnd);
      }
    };
  }, [currentIndex, qrdata]);

  const showSlide = (index) => {
    if (qrdata.length === 0) return;
    if (index < 0) {
      setCurrentIndex(qrdata.length - 1);
    } else if (index >= qrdata.length) {
      setCurrentIndex(0);
    } else {
      setCurrentIndex(index);
    }
  };

  if (error) {
    return (
      <div>
        <div>Error: {error}</div>
        {isFsApiAvailable ? (
          <button onClick={loadQrdataFromFile}>Select qrdata.yaml</button>
        ) : (
          <button onClick={loadQrdataFromInput}>Select qrdata.yaml</button>
        )}
      </div>
    );
  }

  if (qrdata.length === 0) {
    return (
      <div>
        <div>No qrcode data available. Please select a file.</div>
        {isFsApiAvailable ? (
          <button onClick={loadQrdataFromFile}>Select qrdata.yaml</button>
        ) : (
          <button onClick={loadQrdataFromInput}>Select qrdata.yaml</button>
        )}
      </div>
    );
  }

  return (
    <div className="QrCodeCarousel" ref={carouselRef}>
      <div className="carousel-item">
        <div className="carousel-content">
          <img
            src={qrCodes[currentIndex] || '/placeholder.png'}
            alt="QR Code"
            className="qr-code"
          />
          <div
            data-testid="description"
            className="description"
            style={{ minHeight: `${descriptionHeight}px` }}
            dangerouslySetInnerHTML={{
              __html: descriptionHtml || 'Loading description...',
            }}
          />
        </div>
      </div>
      <div className="controls">
        <button
          role="button"
          aria-label="Previous slide"
          onClick={() => showSlide(currentIndex - 1)}
        >
          &lt;
        </button>
        <button
          role="button"
          aria-label="Next slide"
          onClick={() => showSlide(currentIndex + 1)}
        >
          &gt;
        </button>
      </div>
      <div className="load-new-file">
        {isFsApiAvailable ? (
          <button onClick={loadQrdataFromFile}>Load a different qrdata.yaml</button>
        ) : (
          <button onClick={loadQrdataFromInput}>Load a different qrdata.yaml</button>
        )}
      </div>
    </div>
  );
}

export default QrCodeCarousel;