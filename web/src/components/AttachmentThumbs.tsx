import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { isImage, isPdf } from '../attachments/files';
import { getBlob } from '../data/repo';
import type { Attachment } from '../data/types';
import { splitQrCodes } from '../attachments/qrText';

const qrCount = (text: string) => splitQrCodes(text).length;

function Thumb({ attachment }: { attachment: Attachment }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    if (isImage(attachment.mime)) {
      getBlob(attachment.id).then((blob) => {
        if (blob) {
          objectUrl = URL.createObjectURL(new Blob([blob.bytes], { type: blob.mime }));
          setUrl(objectUrl);
        }
      });
    }
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [attachment.id, attachment.mime]);

  return (
    <Link className="thumb" to={`/attachments/${attachment.id}`} title={attachment.name}>
      {url ? <img src={url} alt={attachment.name} /> : <span className="big">{isPdf(attachment.mime) ? '📄' : isImage(attachment.mime) ? '🖼️' : '📎'}</span>}
      {attachment.qrText && <span className="qr">{qrCount(attachment.qrText) > 1 ? `${qrCount(attachment.qrText)} QR` : 'QR'}</span>}
      <span className="name">{attachment.name}</span>
    </Link>
  );
}

export function AttachmentThumbs({ attachments }: { attachments: Attachment[] }) {
  if (attachments.length === 0) {
    return null;
  }
  return (
    <div className="thumbs">
      {attachments.map((attachment) => (
        <Thumb key={attachment.id} attachment={attachment} />
      ))}
    </div>
  );
}
